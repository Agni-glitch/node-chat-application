import React from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Avatar from "../../../components/Avatar";
import useLogout from "../../../hooks/useLogout";
import { formatName } from "../../../utils/format";

export default function Header() {
  const user = useSelector((state) => state.userReducer.user);
  const logout = useLogout();

  return (
    <header className="app-header">
      <Link to="/" className="brand" aria-label="Quick Chat home">
        <span className="brand-mark">
          <i className="fa fa-comments" aria-hidden="true" />
        </span>
        <span className="brand-name">Quick Chat</span>
      </Link>
      <div className="header-actions">
        <Link to="/profile" className="header-profile" title="Your profile">
          <Avatar user={user} size={36} />
          <span className="header-profile-name">{formatName(user)}</span>
        </Link>
        <button type="button" className="icon-btn" onClick={logout} title="Log out" aria-label="Log out">
          <i className="fa fa-sign-out" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
