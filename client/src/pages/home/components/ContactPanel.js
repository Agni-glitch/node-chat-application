import React, { useEffect } from "react";
import Avatar from "../../../components/Avatar";
import SocialLinks from "../../../components/SocialLinks";
import { formatName } from "../../../utils/format";

/** Slide-over with the other member's profile and links. */
export default function ContactPanel({ user, online, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="contact-panel" role="dialog" aria-modal="true" aria-label={`${formatName(user)} profile`}>
        <div className="contact-panel-top">
          <span className="contact-panel-title">Contact info</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close contact info">
            <i className="fa fa-times" aria-hidden="true" />
          </button>
        </div>
        <div className="contact-panel-body">
          <Avatar user={user} size={112} online={online} />
          <h2 className="contact-name">{formatName(user)}</h2>
          <p className="contact-email">{user.email}</p>
          <h3 className="section-label">Links</h3>
          <SocialLinks links={user.socialLinks} emptyText={`${user.firstname} hasn't added any links.`} />
        </div>
      </aside>
    </>
  );
}
