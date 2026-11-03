import React from "react";

export default function Search({ searchKey, setSearchKey }) {
  return (
    <div className="search">
      <i className="fa fa-search search-icon" aria-hidden="true" />
      <input
        type="search"
        className="search-input"
        placeholder="Search people by name or email"
        aria-label="Search people"
        value={searchKey}
        onChange={(e) => setSearchKey(e.target.value)}
      />
      {searchKey && (
        <button type="button" className="search-clear" onClick={() => setSearchKey("")} aria-label="Clear search">
          <i className="fa fa-times" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
