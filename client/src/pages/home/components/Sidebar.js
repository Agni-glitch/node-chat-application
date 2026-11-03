import React, { useState } from "react";
import Search from "./Search";
import UsersList from "./UsersList";

export default function Sidebar() {
  const [searchKey, setSearchKey] = useState("");
  return (
    <aside className="sidebar" aria-label="Conversations">
      <div className="sidebar-top">
        <h2 className="sidebar-title">{searchKey ? "People" : "Chats"}</h2>
        <Search searchKey={searchKey} setSearchKey={setSearchKey} />
      </div>
      <UsersList searchKey={searchKey} onDone={() => setSearchKey("")} />
    </aside>
  );
}
