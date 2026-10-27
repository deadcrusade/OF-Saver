"use strict";
const status = document.getElementById("status");
const connect = document.getElementById("connect");
const save = document.getElementById("save");
const disconnect = document.getElementById("disconnect");
const replaceRow = document.getElementById("replaceRow");
async function update(action = "status") {
  if (action === "connect") document.getElementById("replace").checked = false;
  const reply = await chrome.runtime.sendMessage({action,replace:document.getElementById("replace").checked});
  if (!reply.ok) { status.textContent = reply.error; return; }
  connect.hidden = reply.connected && !reply.saved;
  save.hidden = !reply.ready || reply.saved;
  disconnect.hidden = !reply.connected;
  replaceRow.hidden = !reply.replace || !reply.ready || reply.saved;
  save.disabled = reply.replace && !document.getElementById("replace").checked;
  status.textContent = reply.saved ? `Session saved to ${reply.profileName}. Check it in OF Saver → Authentication.` : reply.connected ? (reply.error || `Profile: ${reply.profileName}. ${reply.ready ? "Ready to save the session." : "Refresh the OnlyFans tab, then reopen this popup."}`) : "Open OF Saver, register the bridge in Authentication, then connect this tab.";
}
connect.addEventListener("click",() => update("connect"));
save.addEventListener("click",() => update("save"));
disconnect.addEventListener("click",() => update("disconnect"));
document.getElementById("replace").addEventListener("change",() => update());
update();
