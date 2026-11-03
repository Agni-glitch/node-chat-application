import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { createNewChat } from "../../../apiCalls/chat";
import { openBotChat } from "../../../apiCalls/bots";
import { chatAdded, setSelectedChat } from "../../../redux/userSlice";
import Avatar from "../../../components/Avatar";
import BotAvatar from "../../../components/BotAvatar";
import GroupAvatar from "../../../components/GroupAvatar";
import { formatListTime, formatName, otherMember } from "../../../utils/format";

function lastMessagePreview(chat, me) {
  const last = chat.lastMessage;
  if (!last) return chat.type === "ai" ? "Ask me anything ✨" : chat.type === "group" ? `${chat.members.length} members` : "Say hello 👋";
  const senderName =
    chat.type === "group" && last.sender !== me ? chat.members.find((m) => m._id === last.sender)?.firstname : "";
  const prefix = last.bot ? `${last.bot.name}: ` : last.sender === me ? "You: " : senderName ? `${senderName}: ` : "";
  if (last.bot?.kind === "image" && last.image) return `${prefix}🎨 Generated image`;
  if (last.text) return prefix + last.text;
  if (last.image) return `${prefix}📷 Photo`;
  return prefix;
}

const busyLabel = (list) =>
  list?.length ? `${list[0].name} is ${list[0].kind === "image" ? "drawing" : "thinking"}…` : "";

export default function UsersList({ searchKey, onDone }) {
  const dispatch = useDispatch();
  const { allUsers, allChats, user: me, selectedChat, onlineUsers, typing, bots, aiBusy } = useSelector(
    (state) => state.userReducer
  );
  const [starting, setStarting] = useState(null);
  const query = searchKey.trim().toLowerCase();

  const results = useMemo(() => {
    if (!query) return [];
    return allUsers.filter((u) => `${u.firstname} ${u.lastname} ${u.email}`.toLowerCase().includes(query));
  }, [allUsers, query]);

  const botResults = useMemo(() => {
    if (!query) return [];
    const q = query.replace(/^@/, "");
    return bots.filter((b) => `${b.name} ${b.model} ${b.provider}`.toLowerCase().includes(q));
  }, [bots, query]);

  const groupResults = useMemo(() => {
    if (!query) return [];
    return allChats.filter((c) => c.type === "group" && (c.name || "").toLowerCase().includes(query));
  }, [allChats, query]);

  const chatWith = (userId) =>
    allChats.find((c) => c.type !== "ai" && c.type !== "group" && c.members.some((m) => m._id === userId));

  const open = (chat) => {
    dispatch(chatAdded(chat));
    dispatch(setSelectedChat(chat));
    onDone();
  };

  const openUser = async (u) => {
    const existing = chatWith(u._id);
    if (existing) return open(existing);
    setStarting(u._id);
    const res = await createNewChat(u._id);
    setStarting(null);
    if (!res.success) return toast.error(res.message || "Could not start the chat");
    open(res.data);
  };

  const openBot = async (bot) => {
    const existing = allChats.find((c) => c.type === "ai" && c.bot?._id === bot._id);
    if (existing) return open(existing);
    setStarting(bot._id);
    const res = await openBotChat(bot._id);
    setStarting(null);
    if (!res.success) return toast.error(res.message || "Could not open the AI chat");
    open(res.data);
  };

  if (query) {
    if (results.length === 0 && botResults.length === 0 && groupResults.length === 0) {
      return <EmptyList icon="fa-user-times" text={`No one matches “${searchKey.trim()}”.`} />;
    }
    return (
      <ul className="conversation-list">
        {groupResults.length > 0 && <li className="list-heading">Groups</li>}
        {groupResults.map((g) => (
          <li key={g._id}>
            <button type="button" className="conversation" onClick={() => open(g)}>
              <GroupAvatar chat={g} />
              <span className="conversation-body">
                <span className="conversation-name">{g.name}</span>
                <span className="conversation-preview">{g.members.length} members</span>
              </span>
              <span className="chip">Open</span>
            </button>
          </li>
        ))}
        {botResults.length > 0 && <li className="list-heading">Your AI models</li>}
        {botResults.map((b) => (
          <li key={b._id}>
            <button type="button" className="conversation" onClick={() => openBot(b)} disabled={starting === b._id}>
              <BotAvatar bot={b} />
              <span className="conversation-body">
                <span className="conversation-name">@{b.name}</span>
                <span className="conversation-preview">
                  {b.kind === "image" ? "Image model" : "Chat model"} · {b.model}
                </span>
              </span>
              <span className="chip chip-ai">{starting === b._id ? "Opening…" : "Chat"}</span>
            </button>
          </li>
        ))}
        {results.length > 0 && (botResults.length > 0 || groupResults.length > 0) && <li className="list-heading">People</li>}
        {results.map((u) => {
          const hasChat = Boolean(chatWith(u._id));
          return (
            <li key={u._id}>
              <button type="button" className="conversation" onClick={() => openUser(u)} disabled={starting === u._id}>
                <Avatar user={u} online={onlineUsers.includes(u._id)} />
                <span className="conversation-body">
                  <span className="conversation-name">{formatName(u)}</span>
                  <span className="conversation-preview">{u.email}</span>
                </span>
                <span className={`chip ${hasChat ? "" : "chip-accent"}`}>
                  {starting === u._id ? "Starting…" : hasChat ? "Open" : "Start chat"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const chats = allChats.filter((c) => (c.type === "ai" ? c.bot : c.type === "group" ? true : otherMember(c, me._id)));
  if (chats.length === 0) {
    return (
      <EmptyList
        icon="fa-comments-o"
        text={
          <>
            No conversations yet. Search for someone to start chatting, or <Link to="/models">add an AI model</Link>.
          </>
        }
      />
    );
  }

  return (
    <ul className="conversation-list">
      {chats.map((chat) => {
        const isAi = chat.type === "ai";
        const isGroup = chat.type === "group";
        const other = isAi || isGroup ? null : otherMember(chat, me._id);
        const unread = isGroup
          ? chat.unreadMessageCount || 0
          : !isAi && chat.lastMessage && chat.lastMessage.sender !== me._id
            ? chat.unreadMessageCount
            : 0;
        const typer = typing[chat._id];
        const typerName =
          isGroup && typeof typer === "string" ? chat.members.find((m) => m._id === typer)?.firstname : "";
        const active = selectedChat?._id === chat._id;
        const busy = busyLabel(aiBusy[chat._id]);
        const status = busy || (typer ? (typerName ? `${typerName} is typing…` : "typing…") : "");
        return (
          <li key={chat._id}>
            <button
              type="button"
              className={`conversation ${active ? "is-active" : ""} ${unread ? "is-unread" : ""}`}
              onClick={() => dispatch(setSelectedChat(chat))}
              aria-current={active ? "true" : undefined}
            >
              {isAi ? (
                <BotAvatar bot={chat.bot} />
              ) : isGroup ? (
                <GroupAvatar chat={chat} />
              ) : (
                <Avatar user={other} online={onlineUsers.includes(other._id)} />
              )}
              <span className="conversation-body">
                <span className="conversation-row">
                  <span className="conversation-name">
                    {isAi ? chat.bot.name : isGroup ? chat.name : formatName(other)}
                    {isAi && <span className="ai-chip">AI</span>}
                  </span>
                  <span className="conversation-time">{formatListTime(chat.lastMessage?.createdAt)}</span>
                </span>
                <span className="conversation-row">
                  <span className={`conversation-preview ${status ? "is-typing" : ""}`}>
                    {status || lastMessagePreview(chat, me._id)}
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
