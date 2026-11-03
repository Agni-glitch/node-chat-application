import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import { addGroupMembers, removeGroupMember, renameGroup } from "../../../apiCalls/chat";
import { chatRemoved, chatUpdated } from "../../../redux/userSlice";
import Avatar from "../../../components/Avatar";
import GroupAvatar from "../../../components/GroupAvatar";
import Modal from "../../../components/Modal";
import MemberPicker from "../../../components/MemberPicker";
import { formatName } from "../../../utils/format";

/** Slide-over with group members and admin actions. */
export default function GroupPanel({ chat, onClose }) {
  const dispatch = useDispatch();
  const { user: me, onlineUsers, allUsers } = useSelector((state) => state.userReducer);
  const admins = (chat.admins || []).map(String);
  const amAdmin = admins.includes(me._id);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(chat.name);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !adding && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, adding]);

  const members = [...chat.members].sort((a, b) => {
    if (a._id === me._id) return -1;
    if (b._id === me._id) return 1;
    return Number(admins.includes(b._id)) - Number(admins.includes(a._id)) || formatName(a).localeCompare(formatName(b));
  });

  const run = async (fn) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.success) toast.error(res.message || "Something went wrong");
    return res;
  };

  const saveName = async (e) => {
    e.preventDefault();
    const res = await run(() => renameGroup(chat._id, name));
    if (res.success) {
      dispatch(chatUpdated(res.data));
      setRenaming(false);
    }
  };

  const add = async () => {
    const res = await run(() => addGroupMembers(chat._id, toAdd));
    if (res.success) {
      dispatch(chatUpdated(res.data));
      toast.success(res.message);
      setAdding(false);
      setToAdd([]);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Remove ${formatName(u)} from "${chat.name}"?`)) return;
    const res = await run(() => removeGroupMember(chat._id, u._id));
    if (res.success) toast.success(res.message);
  };

  const leave = async () => {
    if (!window.confirm(`Leave "${chat.name}"? You'll lose access to its messages.`)) return;
    const res = await run(() => removeGroupMember(chat._id, me._id));
    if (res.success) {
      toast.success(res.message);
      dispatch(chatRemoved(chat._id));
    }
  };

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="contact-panel" role="dialog" aria-modal="true" aria-label="Group info">
        <div className="contact-panel-top">
          <span className="contact-panel-title">Group info</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close group info">
            <i className="fa fa-times" aria-hidden="true" />
          </button>
        </div>
        <div className="contact-panel-body">
          <GroupAvatar chat={chat} size={96} />
          {renaming ? (
            <form className="rename-form" onSubmit={saveName}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoFocus aria-label="Group name" />
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>
                Save
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <h2 className="contact-name">
              {chat.name}
              {amAdmin && (
                <button type="button" className="icon-btn inline-edit" onClick={() => setRenaming(true)} aria-label="Rename group">
                  <i className="fa fa-pencil" aria-hidden="true" />
                </button>
              )}
            </h2>
          )}
          <p className="contact-email">
            {chat.members.length} members · {chat.members.filter((m) => onlineUsers.includes(m._id)).length} online
          </p>

          <div className="section-head">
            <h3 className="section-label">Members</h3>
            {amAdmin && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
                <i className="fa fa-user-plus" aria-hidden="true" /> Add
              </button>
            )}
          </div>
          <ul className="member-list">
            {members.map((u) => (
              <li key={u._id} className="member-row">
                <Avatar user={u} size={38} online={onlineUsers.includes(u._id)} />
                <span className="conversation-body">
                  <span className="conversation-name">
                    {u._id === me._id ? "You" : formatName(u)}
                    {admins.includes(u._id) && <span className="chip chip-accent admin-chip">Admin</span>}
                  </span>
                  <span className="conversation-preview">{u.email}</span>
                </span>
                {amAdmin && u._id !== me._id && (
                  <button type="button" className="icon-btn danger" onClick={() => remove(u)} disabled={busy} aria-label={`Remove ${formatName(u)}`}>
                    <i className="fa fa-user-times" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <p className="group-rules">
            <i className="fa fa-clock-o" aria-hidden="true" /> A message disappears 2 minutes after <strong>everyone</strong> has
            seen it, and as soon as anyone closes the group.
          </p>
          <button type="button" className="btn btn-danger-ghost" onClick={leave} disabled={busy}>
            <i className="fa fa-sign-out" aria-hidden="true" /> Leave group
          </button>
        </div>
      </aside>
      {adding && (
        <Modal
          title={`Add to ${chat.name}`}
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary" onClick={add} disabled={!toAdd.length || busy}>
              {busy ? <span className="btn-spinner" /> : `Add ${toAdd.length || ""}`}
            </button>
          }
        >
          <MemberPicker users={allUsers} selected={toAdd} onChange={setToAdd} exclude={chat.members.map((m) => m._id)} />
        </Modal>
      )}
    </>
  );
}
