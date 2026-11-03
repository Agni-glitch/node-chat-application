import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import { createNewChat } from "../../../apiCalls/chat";
import { chatAdded, setSelectedChat } from "../../../redux/userSlice";
import Avatar from "../../../components/Avatar";
import { formatListTime, formatName, otherMember } from "../../../utils/format";

function lastMessagePreview(chat, me) {
  const last = chat.lastMessage;
  if (!last) return "Say hello 👋";
  const prefix = last.sender === me ? "You: " : "";
  if (last.text) return prefix + last.text;
  if (last.image) return `${prefix}📷 Photo`;
  return prefix;
}

export default function UsersList({ searchKey, onDone }) {
  const dispatch = useDispatch();
  const { allUsers, allChats, user: me, selectedChat, onlineUsers, typing } = useSelector(
    (state) => state.userReducer
  );
  const [startingWith, setStartingWith] = useState(null);
  const query = searchKey.trim().toLowerCase();

  const results = useMemo(() => {
    if (!query) return [];
    return allUsers.filter((u) =>
      `${u.firstname} ${u.lastname} ${u.email}`.toLowerCase().includes(query)
    );
  }, [allUsers, query]);

  const chatWith = (userId) => allChats.find((c) => c.members.some((m) => m._id === userId));

  const openUser = async (u) => {
    const existing = chatWith(u._id);
    if (existing) {
      dispatch(setSelectedChat(existing));
      onDone();
      return;
    }
    setStartingWith(u._id);
    const res = await createNewChat(u._id);
    setStartingWith(null);
    if (!res.success) {
      toast.error(res.message || "Could not start the chat");
      return;
    }
    dispatch(chatAdded(res.data));
    dispatch(setSelectedChat(res.data));
    onDone();
  };

  if (query) {
    if (results.length === 0) {
      return <EmptyList icon="fa-user-times" text={`No one matches “${searchKey.trim()}”.`} />;
    }
    return (
      <ul className="conversation-list">
        {results.map((u) => {
          const hasChat = Boolean(chatWith(u._id));
          return (
            <li key={u._id}>
              <button
                type="button"
                className="conversation"
                onClick={() => openUser(u)}
                disabled={startingWith === u._id}
              >
                <Avatar user={u} online={onlineUsers.includes(u._id)} />
                <span className="conversation-body">
                  <span className="conversation-name">{formatName(u)}</span>
                  <span className="conversation-preview">{u.email}</span>
                </span>
                <span className={`chip ${hasChat ? "" : "chip-accent"}`}>
                  {startingWith === u._id ? "Starting…" : hasChat ? "Open" : "Start chat"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const chats = allChats.filter((c) => otherMember(c, me._id));
  if (chats.length === 0) {
    return <EmptyList icon="fa-comments-o" text="No conversations yet. Search for someone to start chatting." />;
  }

  return (
    <ul className="conversation-list">
      {chats.map((chat) => {
        const other = otherMember(chat, me._id);
        const unread = chat.lastMessage && chat.lastMessage.sender !== me._id ? chat.unreadMessageCount : 0;
        const active = selectedChat?._id === chat._id;
        const isTyping = typing[chat._id];
        return (
          <li key={chat._id}>
            <button
              type="button"
              className={`conversation ${active ? "is-active" : ""} ${unread ? "is-unread" : ""}`}
              onClick={() => dispatch(setSelectedChat(chat))}
              aria-current={active ? "true" : undefined}
            >
              <Avatar user={other} online={onlineUsers.includes(other._id)} />
              <span className="conversation-body">
                <span className="conversation-row">
                  <span className="conversation-name">{formatName(other)}</span>
                  <span className="conversation-time">{formatListTime(chat.lastMessage?.createdAt)}</span>
                </span>
                <span className="conversation-row">
                  <span className={`conversation-preview ${isTyping ? "is-typing" : ""}`}>
                    {isTyping ? "typing…" : lastMessagePreview(chat, me._id)}
                  </span>
                  {unread > 0 && (
                    <span className="badge" aria-label={`${unread} unread messages`}>
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyList({ icon, text }) {
  return (
    <div className="empty-list">
      <i className={`fa ${icon}`} aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}
