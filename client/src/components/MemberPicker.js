import React, { useMemo, useState } from "react";
import Avatar from "./Avatar";
import { formatName } from "../utils/format";

/** Searchable multi-select list of people. `exclude` hides ids (e.g. existing members). */
export default function MemberPicker({ users, selected, onChange, exclude = [] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      users
        .filter((u) => !exclude.includes(u._id))
        .filter((u) => !q || `${u.firstname} ${u.lastname} ${u.email}`.toLowerCase().includes(q)),
    [users, exclude, q]
  );
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const picked = users.filter((u) => selected.includes(u._id));

  return (
    <div className="member-picker">
      {picked.length > 0 && (
        <div className="picked">
          {picked.map((u) => (
            <button type="button" key={u._id} className="picked-chip" onClick={() => toggle(u._id)} aria-label={`Remove ${formatName(u)}`}>
              <Avatar user={u} size={22} /> {u.firstname}
              <i className="fa fa-times" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <div className="search">
        <i className="fa fa-search search-icon" aria-hidden="true" />
        <input
          type="search"
          className="search-input"
          placeholder="Search people"
          aria-label="Search people"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ul className="picker-list" role="listbox" aria-multiselectable="true">
        {list.length === 0 && <li className="picker-empty">No one found.</li>}
        {list.map((u) => {
          const on = selected.includes(u._id);
          return (
            <li key={u._id} role="option" aria-selected={on}>
              <button type="button" className={`picker-item ${on ? "is-on" : ""}`} onClick={() => toggle(u._id)}>
                <Avatar user={u} size={36} />
                <span className="conversation-body">
                  <span className="conversation-name">{formatName(u)}</span>
                  <span className="conversation-preview">{u.email}</span>
                </span>
                <span className={`check ${on ? "is-on" : ""}`} aria-hidden="true">
                  {on && <i className="fa fa-check" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
