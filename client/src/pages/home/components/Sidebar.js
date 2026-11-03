import React, { useState } from "react";
import Search from "./Search";
import UsersList from "./UsersList";
import NewGroupModal from "./NewGroupModal";

export default function Sidebar() {
  const [searchKey, setSearchKey] = useState("");
  const [newGroup, setNewGroup] = useState(false);
  return (
    <aside className="sidebar" aria-label="Conversations">
      <div className="sidebar-top">
        <div className="sidebar-title-row">
          <h2 className="sidebar-title">{searchKey ? "Search" : "Chats"}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewGroup(true)} title="Create a group">
            <i className="fa fa-users" aria-hidden="true" /> New group
          </button>
        </div>
        <Search searchKey={searchKey} setSearchKey={setSearchKey} />
      </div>
      <UsersList searchKey={searchKey} onDone={() => setSearchKey("")} />
      {newGroup && <NewGroupModal onClose={() => setNewGroup(false)} />}
    </aside>
  );
}
