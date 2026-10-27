"use strict";
const HOST = "com.ofsaver.credentials";
let state = null;
let port = null;
let waiting = null;
let expiry = null;
function siteTab(tab) {
  try { const url = new URL(tab.url); return url.protocol === "https:" && ["onlyfans.com", "www.onlyfans.com"].includes(url.hostname) && !tab.incognito; }
  catch { return false; }
}
function stop() {
  clearTimeout(expiry);
  const old = port; port = null;
  if (waiting) waiting.reject(new Error("Browser connection closed."));
  waiting = null; state = null;
  if (old) old.disconnect();
}
function publicState() {
  return state ? {connected:true, ready:!!state.bc, profileName:state.profileName, replace:state.replace, saved:!!state.saved, error:state.error || ""} : {connected:false};
}
function nativeRequest(message) {
  return new Promise((resolve,reject) => {
    if (!port) { reject(new Error("Register the local bridge in OF Saver first.")); return; }
    if (waiting) { reject(new Error("A connection request is already in progress.")); return; }
    waiting = {resolve,reject};
    try { port.postMessage(message); }
    catch { waiting = null; reject(new Error("Reconnect the local bridge.")); }
  });
}
async function connect() {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab || !siteTab(tab)) throw new Error("Select a signed-in OnlyFans tab in a regular browser window.");
  stop();
  const connectedPort = chrome.runtime.connectNative(HOST);
  port = connectedPort;
  connectedPort.onMessage.addListener(reply => {
    if (port !== connectedPort) return;
    const pending = waiting; waiting = null;
    if (!pending) return;
    reply.ok ? pending.resolve(reply) : pending.reject(new Error(reply.error || "The local bridge rejected the connection."));
  });
  connectedPort.onDisconnect.addListener(() => {
    const message = chrome.runtime.lastError?.message || "Local connection closed.";
    if (port !== connectedPort) return;
    if (waiting) { waiting.reject(new Error(message)); waiting = null; }
    port = null;
    if (state && !state.saved) state.error = message;
  });
  const reply = await nativeRequest({action:"begin"});
  state = {tabId:tab.id, nonce:reply.nonce, profile:reply.profile, profileName:reply.profile_name, replace:reply.already_saved, bc:null, agent:null, started:Date.now(), saved:false};
  expiry = setTimeout(stop,120000);
  return publicState();
}
chrome.webRequest.onBeforeSendHeaders.addListener(details => {
  if (!state || state.saved || details.tabId !== state.tabId || Date.now()-state.started > 120000) return;
  for (const header of details.requestHeaders || []) {
    const name = header.name.toLowerCase();
    if (name === "x-bc") state.bc = header.value;
    if (name === "user-agent") state.agent = header.value;
  }
}, {urls:["https://onlyfans.com/api2/*","https://www.onlyfans.com/api2/*"]}, ["requestHeaders","extraHeaders"]);
async function save(replace) {
  if (!state?.bc || !port) throw new Error("Connect, refresh the OnlyFans tab, then reopen this popup.");
  const connection = state;
  const connectedPort = port;
  const tab = await chrome.tabs.get(connection.tabId);
  if (!siteTab(tab)) throw new Error("The connected tab is no longer an eligible OnlyFans tab.");
  const cookies = await chrome.cookies.getAll({url:"https://onlyfans.com/"});
  if (state !== connection || port !== connectedPort) throw new Error("The browser connection changed; reconnect before saving.");
  const byName = Object.fromEntries(cookies.map(cookie => [cookie.name,cookie.value]));
  const id = byName.auth_id;
  const uidName = cookies.find(cookie => cookie.name === `auth_uid_${id}`)?.name || "auth_uid_";
  const credentials = {sess:byName.sess || "",auth_id:id || "",auth_uid:byName[uidName] || "",auth_uid_cookie_name:uidName,user_agent:connection.agent || navigator.userAgent,"x-bc":connection.bc};
  if (!credentials.sess || !id) throw new Error("This browser tab does not have a saved signed-in session.");
  await nativeRequest({action:"save",site:"https://onlyfans.com",nonce:connection.nonce,replace:replace === true,credentials});
  if (state !== connection) throw new Error("The browser connection changed; check the saved profile in OF Saver.");
  state.saved = true; state.bc = null; state.agent = null; state.nonce = null;
  clearTimeout(expiry); if (port) port.disconnect(); port = null;
  return publicState();
}
chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return false;
  (async () => {
    if (message.action === "status") return publicState();
    if (message.action === "connect") return connect();
    if (message.action === "save") return save(message.replace);
    if (message.action === "disconnect") { stop(); return publicState(); }
    throw new Error("Unsupported connection action.");
  })().then(value => respond({ok:true,...value})).catch(error => respond({ok:false,error:error.message}));
  return true;
});
