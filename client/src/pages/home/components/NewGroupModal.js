import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import { createGroup } from "../../../apiCalls/chat";
import { chatAdded, setSelectedChat } from "../../../redux/userSlice";
import Modal from "../../../components/Modal";
import MemberPicker from "../../../components/MemberPicker";

export default function NewGroupModal({ onClose }) {
  const dispatch = useDispatch();
  const allUsers = useSelector((state) => state.userReducer.allUsers);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const ready = name.trim() && selected.length >= 2;

  const create = async (e) => {
    e?.preventDefault();
    if (!ready) return;
    setSaving(true);
    const res = await createGroup(name.trim(), selected);
    setSaving(false);
    if (!res.success) return toast.error(res.message || "Could not create the group");
    dispatch(chatAdded(res.data));
    dispatch(setSelectedChat(res.data));
    toast.success(res.message);
    onClose();
  };

  return (
    <Modal
      title="New group"
      onClose={onClose}
      footer={
        <>
          <span className="modal-hint">{selected.length < 2 ? "Pick at least 2 people" : `${selected.length + 1} members`}</span>
          <button type="button" className="btn btn-primary" onClick={create} disabled={!ready || saving}>
            {saving ? <span className="btn-spinner" /> : "Create group"}
          </button>
        </>
      }
    >
      <form onSubmit={create} className="form">
        <div className="field">
          <label htmlFor="group-name">Group name</label>
          <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Weekend trip 🚗" autoFocus />
        </div>
      </form>
      <MemberPicker users={allUsers} selected={selected} onChange={setSelected} />
    </Modal>
  );
}
