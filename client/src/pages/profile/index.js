import React, { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import moment from "moment";
import { toast } from "react-hot-toast";
import { updateSocialLinks, uploadProfilePic } from "../../apiCalls/users";
import { setUser } from "../../redux/userSlice";
import Header from "../home/components/Header";
import Avatar from "../../components/Avatar";
import SocialLinks from "../../components/SocialLinks";
import useLogout from "../../hooks/useLogout";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_MB, SOCIAL_PLATFORMS } from "../../config";
import { formatName, readFileAsDataURL } from "../../utils/format";

const linksFrom = (user) =>
  Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.key, user?.socialLinks?.[p.key] || ""]));

/** View/edit the user's social profile links (shown to people they chat with). */
function LinksEditor({ user }) {
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const [links, setLinks] = useState(() => linksFrom(user));
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setLinks(linksFrom(user));
    setEditing(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await updateSocialLinks(links);
    setSaving(false);
    if (!res.success) {
      toast.error(res.message || "Could not save your links");
      return;
    }
    dispatch(setUser(res.data));
    setEditing(false);
    toast.success("Profile links saved");
  };

  return (
    <section className="profile-section">
      <div className="profile-section-head">
        <div>
          <h2 className="section-label">Profile links</h2>
          <p className="section-hint">Visible to people you chat with.</p>
        </div>
        {!editing && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={startEditing}>
            <i className="fa fa-pencil" aria-hidden="true" /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <form className="links-form" onSubmit={save}>
          {SOCIAL_PLATFORMS.map((p) => (
            <label key={p.key} className="link-input">
              <span className={`social-icon social-${p.key}`} title={p.label}>
                <i className={`fa ${p.icon}`} aria-hidden="true" />
              </span>
              <span className="sr-only">{p.label}</span>
              <input
                type="text"
                inputMode="url"
                placeholder={p.placeholder}
                value={links[p.key]}
                maxLength={300}
                onChange={(e) => setLinks({ ...links, [p.key]: e.target.value })}
              />
            </label>
          ))}
          <div className="profile-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="btn-spinner" /> : "Save links"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <SocialLinks links={user?.socialLinks} emptyText="Add your Instagram, X, LinkedIn and more." />
      )}
    </section>
  );
}

export default function Profile() {
  const dispatch = useDispatch();
  const logout = useLogout();
  const user = useSelector((state) => state.userReducer.user);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const onFileSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Please choose a PNG, JPEG, GIF or WebP image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`Images must be smaller than ${MAX_IMAGE_MB} MB`);
      return;
    }
    try {
      setPreview(await readFileAsDataURL(file));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const save = async () => {
    setUploading(true);
    const res = await uploadProfilePic(preview);
    setUploading(false);
    if (!res.success) {
      toast.error(res.message || "Upload failed");
      return;
    }
    dispatch(setUser(res.data));
    setPreview(null);
    toast.success("Profile picture updated");
  };

  const shown = preview ? { ...user, profilePic: preview } : user;

  return (
    <div className="app-shell">
      <Header />
      <main className="profile-page">
        <Link to="/" className="back-link">
          <i className="fa fa-arrow-left" aria-hidden="true" /> Back to chats
        </Link>
        <div className="profile-card">
          <div className="profile-avatar">
            <Avatar user={shown} size={144} />
            <button
              type="button"
              className="profile-avatar-edit"
              onClick={() => fileRef.current?.click()}
              aria-label="Choose a new profile picture"
            >
              <i className="fa fa-camera" aria-hidden="true" />
            </button>
            <input ref={fileRef} type="file" hidden accept={ACCEPTED_IMAGE_TYPES.join(",")} onChange={onFileSelect} />
          </div>

          {preview && (
            <div className="profile-actions">
              <button type="button" className="btn btn-primary" onClick={save} disabled={uploading}>
                {uploading ? <span className="btn-spinner" /> : "Save photo"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)} disabled={uploading}>
                Cancel
              </button>
            </div>
          )}

          <h1 className="profile-name">{formatName(user)}</h1>
          <dl className="profile-details">
            <div>
              <dt>Email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{moment(user?.createdAt).format("MMMM D, YYYY")}</dd>
            </div>
          </dl>
          <LinksEditor user={user} />

          <button type="button" className="btn btn-danger-ghost" onClick={logout}>
            <i className="fa fa-sign-out" aria-hidden="true" /> Log out
          </button>
        </div>
      </main>
    </div>
  );
}
