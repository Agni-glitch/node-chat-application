import React, { Fragment, Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { createNewMessage, getAllMessage } from "../../../apiCalls/message";
import { clearUnreadMessageCount } from "../../../apiCalls/chat";
import { messageReceived, messagesRead, setMessages, setMessagesLoading, setSelectedChat } from "../../../redux/userSlice";
import { getSocket } from "../../../socket";
import Avatar from "../../../components/Avatar";
import BotAvatar from "../../../components/BotAvatar";
import GroupAvatar from "../../../components/GroupAvatar";
import GroupPanel from "./GroupPanel";
import Loader from "../../../components/Loader";
import ContactPanel from "./ContactPanel";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "../../../config";
import { downloadImage, openImage } from "../../../utils/media";
import {
  formatDayLabel,
  formatMessageTime,
  formatName,
  otherMember,
  readFileAsDataURL,
  sameDay,
} from "../../../utils/format";

const EmojiPicker = lazy(() => import("emoji-picker-react"));
const TYPING_THROTTLE_MS = 2000;
const MENTION_SPLIT_RE = /(@[A-Za-z][A-Za-z0-9_-]{0,29})/g;

/** Ticks every second while any message has a disappearing timer running. */
function useNow(active, offsetMs) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now() + offsetMs);
    const id = setInterval(() => setNow(Date.now() + offsetMs), 1000);
    return () => clearInterval(id);
  }, [active, offsetMs]);
  return now;
}

const formatCountdown = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Renders text with @mentions highlighted. */
function RichText({ text }) {
  const parts = text.split(MENTION_SPLIT_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="mention">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

export default function ChatArea() {
  const dispatch = useDispatch();
  const { selectedChat, user, messages: allMessages, messagesLoading, onlineUsers, typing, appConfig, aiBusy, bots } =
    useSelector((state) => state.userReducer);
  const chatId = selectedChat._id;
  const me = user._id;
  const isAi = selectedChat.type === "ai";
  const isGroup = selectedChat.type === "group";
  const bot = isAi ? selectedChat.bot : null;
  const other = isAi || isGroup ? null : otherMember(selectedChat, me);
  const isOnline = other && onlineUsers.includes(other._id);
  const isTyping = Boolean(typing[chatId]);
  const typerId = typeof typing[chatId] === "string" ? typing[chatId] : null;
  const memberById = Object.fromEntries((selectedChat.members || []).map((m) => [m._id, m]));
  const typerName = isGroup && typerId ? memberById[typerId]?.firstname : "";
  const busy = aiBusy[chatId] || [];
  const [showContact, setShowContact] = useState(false);

  // Seen messages disappear SEEN_MESSAGE_TTL_SECONDS after being read. The server deletes them;
  // hiding them locally at the same moment keeps the UI exact even between server sweeps.
  const ttlMs = appConfig.seenMessageTtlSeconds * 1000;
  const hasTimers = allMessages.some((m) => m.readAt);
  const now = useNow(hasTimers, appConfig.clockOffsetMs);
  const expiresIn = (m) => (m.readAt ? Date.parse(m.readAt) + ttlMs - now : null);
  const messages = allMessages.filter((m) => !m.readAt || expiresIn(m) > 0);
  const ttlLabel =
    appConfig.seenMessageTtlSeconds % 60 === 0
      ? `${appConfig.seenMessageTtlSeconds / 60} minute${appConfig.seenMessageTtlSeconds === 60 ? "" : "s"}`
      : `${appConfig.seenMessageTtlSeconds} seconds`;

  // Load the conversation and mark incoming messages as read.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      dispatch(setMessagesLoading(true));
      const res = await getAllMessage(chatId);
      if (cancelled) return;
      if (!res.success) {
        dispatch(setMessagesLoading(false));
        toast.error(res.message || "Could not load messages");
        return;
      }
      dispatch(setMessages(res.data));
      const unseen = res.data.some((m) =>
        isGroup ? m.sender !== me && !(m.readBy || []).includes(me) : !m.read && (isAi ? m.bot : m.sender !== me)
      );
      if (unseen) {
        const cleared = await clearUnreadMessageCount(chatId);
        if (!cancelled && cleared.success) dispatch(messagesRead({ chatId, readerId: me }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, me, isAi, isGroup, dispatch]);

  // Keep the newest message in view.
  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, isTyping, busy.length, chatId]);

  if (!isAi && !isGroup && !other) return null;
  if (isAi && !bot) return null;

  const title = isAi ? bot.name : isGroup ? selectedChat.name : formatName(other);
  const onlineCount = isGroup ? selectedChat.members.filter((m) => m._id !== me && onlineUsers.includes(m._id)).length : 0;
  const busyText = busy.length ? `${busy.map((b) => b.name).join(", ")} ${busy[0].kind === "image" ? "is drawing" : "is thinking"}…` : "";
  const status = isAi
    ? busyText || `${bot.kind === "image" ? "Image" : "Chat"} model · ${bot.model}`
    : isGroup
      ? busyText ||
        (typerName ? `${typerName} is typing…` : `${selectedChat.members.length} members${onlineCount ? ` · ${onlineCount} online` : ""}`)
      : busyText || (isTyping ? "typing…" : isOnline ? "Online" : "Offline");

  return (
    <section className="chat" aria-label={`Conversation with ${title}`}>
      <div className="chat-header">
        <button
          type="button"
          className="icon-btn chat-back"
          onClick={() => dispatch(setSelectedChat(null))}
          aria-label="Back to conversations"
        >
          <i className="fa fa-arrow-left" aria-hidden="true" />
        </button>
        {isAi ? (
          <div className="chat-header-contact is-static">
            <BotAvatar bot={bot} size={40} />
            <span className="chat-header-text">
              <span className="chat-header-name">
                {bot.name} <span className="ai-chip">AI</span>
              </span>
              <span className={`chat-header-status ${busyText ? "is-typing" : ""}`}>{status}</span>
            </span>
          </div>
        ) : (
          <button type="button" className="chat-header-contact" onClick={() => setShowContact(true)} title={isGroup ? "Group info" : "View contact info"}>
            {isGroup ? <GroupAvatar chat={selectedChat} size={40} /> : <Avatar user={other} size={40} online={isOnline} />}
            <span className="chat-header-text">
              <span className="chat-header-name">{title}</span>
              <span className={`chat-header-status ${busyText || isTyping ? "is-typing" : ""}`}>{status}</span>
            </span>
          </button>
        )}
        {isAi ? (
          <Link to="/models" className="icon-btn chat-info-btn" aria-label="Manage AI models" title="Manage AI models">
            <i className="fa fa-cog" aria-hidden="true" />
          </Link>
        ) : (
          <button type="button" className="icon-btn chat-info-btn" onClick={() => setShowContact(true)} aria-label={isGroup ? "Group info" : "Contact info"}>
            <i className="fa fa-info-circle" aria-hidden="true" />
          </button>
        )}
      </div>
      {showContact && other && <ContactPanel user={other} online={isOnline} onClose={() => setShowContact(false)} />}
      {showContact && isGroup && <GroupPanel chat={selectedChat} onClose={() => setShowContact(false)} />}

      <div className="chat-messages" ref={scrollRef} aria-live="polite">
        <div className="ephemeral-notice">
          <i className="fa fa-clock-o" aria-hidden="true" />{" "}
          {isAi
            ? `Messages and AI replies disappear ${ttlLabel} after they're seen, and when you close this chat.`
            : isGroup
              ? `Messages (including AI replies) disappear ${ttlLabel} after everyone has seen them, and as soon as anyone closes the group.`
              : `Seen messages (including AI replies) disappear after ${ttlLabel}, and as soon as either of you closes the chat.`}
        </div>
        {messagesLoading && messages.length === 0 ? (
          <Loader fullscreen={false} label="Loading messages" />
        ) : messages.length === 0 && busy.length === 0 ? (
          <div className="chat-empty">
            {isAi ? <BotAvatar bot={bot} size={72} /> : isGroup ? <GroupAvatar chat={selectedChat} size={72} /> : <Avatar user={other} size={72} />}
            <p>
              {isAi ? (
                bot.kind === "image" ? (
                  <>
                    Describe an image and <strong>{bot.name}</strong> will draw it.
                  </>
                ) : (
                  <>
                    Ask <strong>{bot.name}</strong> anything. Replies are kept short.
                  </>
                )
              ) : (
                <>
                  No messages here right now. Say something {isGroup ? "in" : "to"} <strong>{title}</strong>!
                  {bots.length > 0 && (
                    <>
                      <br />
                      Tip: type <span className="mention">@{bots[0].name}</span> to ask your AI here.
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || !sameDay(prev.createdAt, msg.createdAt);
            const sameAuthor = prev && prev.sender === msg.sender && (prev.bot?.name || "") === (msg.bot?.name || "");
            return (
              <Fragment key={msg._id}>
                {newDay && (
                  <div className="day-separator">
                    <span>{formatDayLabel(msg.createdAt)}</span>
                  </div>
                )}
                <MessageBubble
                  msg={msg}
                  me={me}
                  isAiChat={isAi}
                  isGroup={isGroup}
                  author={memberById[msg.sender]}
                  memberCount={selectedChat.members.length}
                  otherName={other?.firstname}
                  grouped={!newDay && sameAuthor}
                  expiresIn={expiresIn(msg)}
                />
              </Fragment>
            );
          })
        )}
        {busy.map((b) => (
          <div className="message-row" key={`busy-${b.name}`}>
            <div className="bubble bot-bubble typing-bubble-ai">
              <span className="bot-tag">
                <i className={`fa ${b.kind === "image" ? "fa-paint-brush" : "fa-android"}`} aria-hidden="true" /> {b.name}
                <span className="bot-model">{b.model}</span>
              </span>
              <span className="ai-working">
                {b.kind === "image" ? "Drawing your image" : "Thinking"}
                <span className="dots">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            </div>
          </div>
        ))}
        {isTyping && !isAi && (
          <div className="message-row">
            <div className="bubble typing-bubble" aria-label={`${typerName || title} is typing`}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <Composer
        key={chatId}
        chatId={chatId}
        isAi={isAi}
        bot={bot}
        bots={bots}
        onSent={(m) => dispatch(messageReceived(m))}
      />
    </section>
  );
}

function MessageBubble({ msg, me, isAiChat, isGroup, author, memberCount, otherName, grouped, expiresIn }) {
  const isBot = Boolean(msg.bot);
  const mine = !isBot && msg.sender === me;
  // In person-to-person chats and groups, show whose model answered; ticks for anything the current user sent.
  const showTicks = !isAiChat && msg.sender === me;
  const askerName = msg.sender === me ? "you" : isGroup ? author?.firstname || "a member" : otherName || "them";
  const forWhom = !isAiChat && isBot ? `for ${askerName}` : "";
  const showAuthor = isGroup && !isBot && !mine && !grouped;
  const seenBy = isGroup ? (msg.readBy || []).length : 0;
  const tickTitle = msg.read
    ? isGroup
      ? "Seen by everyone"
      : "Seen"
    : isGroup && seenBy
      ? `Seen by ${seenBy} of ${memberCount - 1}`
      : "Sent";
  const fileName = `${msg.bot?.name || "image"}-${msg._id.slice(-6)}`;

  return (
    <div className={`message-row ${mine ? "is-mine" : ""} ${grouped ? "is-grouped" : ""}`}>
      <div className={`bubble ${isBot ? "bot-bubble" : ""}`}>
        {showAuthor && (
          <span className="bubble-author" style={{ color: authorColor(author?._id) }}>
            {author ? formatName(author) : "Former member"}
          </span>
        )}
        {isBot && !grouped && (
          <span className="bot-tag">
            <i className={`fa ${msg.bot.kind === "image" ? "fa-paint-brush" : "fa-android"}`} aria-hidden="true" />{" "}
            {msg.bot.name}
            <span className="bot-model">{msg.bot.model}</span>
            {forWhom && <span className="bot-for">· {forWhom}</span>}
          </span>
        )}
        {msg.image && (
          <div className="bubble-image">
            <button type="button" className="bubble-image-open" onClick={() => openImage(msg.image)} title="Open in new tab">
              <img src={msg.image} alt={isBot ? `Generated: ${msg.text || "image"}` : "Shared attachment"} loading="lazy" />
            </button>
            <div className="image-actions">
              <button type="button" onClick={() => openImage(msg.image)} aria-label="Open image in new tab" title="Open in new tab">
                <i className="fa fa-external-link" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => downloadImage(msg.image, fileName)} aria-label="Download image" title="Download">
                <i className="fa fa-download" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        {msg.text && (
          <p className={`bubble-text ${isBot && msg.bot.kind === "image" ? "bubble-caption" : ""}`}>
            <RichText text={msg.text} />
          </p>
        )}
        <span className="bubble-meta">
          {msg.readAt && (
            <span className="bubble-timer" title="Disappears soon">
              <i className="fa fa-hourglass-half" aria-hidden="true" />
              {formatCountdown(expiresIn)}
            </span>
          )}
          {formatMessageTime(msg.createdAt)}
          {showTicks && (
            <i
              className={`fa ${msg.read ? "fa-check-circle is-read" : "fa-check"}`}
              title={tickTitle}
              aria-label={tickTitle}
            />
          )}
        </span>
      </div>
    </div>
  );
}

/** Stable, readable colour per member for names in group bubbles. */
function authorColor(id = "") {
  const hue = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return `hsl(${hue} 60% 42%)`;
}

/** Returns the "@partial" being typed right before the caret, or null. */
function mentionQueryAt(text, caret) {
  const m = text.slice(0, caret).match(/(^|\s)@([A-Za-z0-9_-]{0,30})$/);
  return m ? { query: m[2], start: caret - m[2].length - 1 } : null;
}

function Composer({ chatId, isAi, bot, bots, onSent }) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [image, setImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const lastTypingEmit = useRef(0);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  // @mention suggestions for the user's own models (person-to-person chats only).
  const mention = !isAi && bots.length && !dismissed ? mentionQueryAt(text, caret) : null;
  const suggestions = mention
    ? bots.filter((b) => b.name.toLowerCase().startsWith(mention.query.toLowerCase())).slice(0, 6)
    : [];
  const showSuggestions = suggestions.length > 0;

  // Auto-grow the textarea up to a few lines, and restore the caret after inserting a mention
  // synchronously (before the next keystroke can land in the wrong place).
  const pendingCaret = useRef(null);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    if (pendingCaret.current !== null) {
      el.focus();
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [text]);

  useEffect(() => {
    if (!showEmoji) return;
    const onKey = (e) => e.key === "Escape" && setShowEmoji(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showEmoji]);

  const mentionQuery = mention ? mention.query : null;
  useEffect(() => setActive(0), [mentionQuery]);

  const emitTyping = () => {
    if (isAi) return;
    const now = Date.now();
    if (now - lastTypingEmit.current > TYPING_THROTTLE_MS) {
      lastTypingEmit.current = now;
      getSocket().emit("user-typing", { chatId });
    }
  };

  const insertMention = (b) => {
    const before = text.slice(0, mention.start);
    const after = text.slice(caret);
    const next = `${before}@${b.name} ${after.replace(/^\s+/, "")}`;
    const pos = before.length + b.name.length + 2;
    pendingCaret.current = pos;
    setText(next);
    setCaret(pos);
  };

  const pickImage = async (e) => {
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
      setImage(await readFileAsDataURL(file));
      inputRef.current?.focus();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !image) || sending) return;
    setSending(true);
    setShowEmoji(false);
    const res = await createNewMessage({ chatId, text: body, image: image || undefined });
    setSending(false);
    if (!res.success) {
      toast.error(res.message || "Message could not be sent");
      return;
    }
    setText("");
    setCaret(0);
    setImage(null);
    onSent(res.data);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (showSuggestions) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        setActive((i) => (i + d + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(suggestions[active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const canSend = (text.trim() || image) && !sending;
  const placeholder = isAi
    ? bot.kind === "image"
      ? `Describe an image for ${bot.name}…`
      : `Message ${bot.name}…`
    : bots.length
      ? "Type a message, or @ to ask your AI"
      : "Type a message";

  return (
    <div className="composer-wrap">
      {showEmoji && (
        <div className="emoji-popover">
          <Suspense fallback={<Loader fullscreen={false} label="Loading emoji" />}>
            <EmojiPicker
              emojiStyle="native"
              theme="auto"
              lazyLoadEmojis
              width="100%"
              height={360}
              previewConfig={{ showPreview: false }}
              onEmojiClick={(e) => setText((t) => t + e.emoji)}
            />
          </Suspense>
        </div>
      )}
      {showSuggestions && (
        <ul className="mention-popover" role="listbox" aria-label="Your AI models">
          <li className="mention-title">Ask one of your AI models</li>
          {suggestions.map((b, i) => (
            <li key={b._id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`mention-option ${i === active ? "is-active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(b);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <BotAvatar bot={b} size={30} />
                <span className="mention-option-text">
                  <span className="mention-option-name">@{b.name}</span>
                  <span className="mention-option-model">
                    {b.kind === "image" ? "Image" : "Chat"} · {b.model}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {image && (
        <div className="attachment-preview">
          <img src={image} alt="Selected attachment" />
          <button type="button" className="attachment-remove" onClick={() => setImage(null)} aria-label="Remove image">
            <i className="fa fa-times" aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="composer">
        <button
          type="button"
          className={`icon-btn ${showEmoji ? "is-active" : ""}`}
          onClick={() => setShowEmoji((v) => !v)}
          aria-label="Insert emoji"
          aria-expanded={showEmoji}
        >
          <i className="fa fa-smile-o" aria-hidden="true" />
        </button>
        {!isAi && (
          <>
            <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Attach image">
              <i className="fa fa-paperclip" aria-hidden="true" />
            </button>
            <input ref={fileRef} type="file" hidden accept={ACCEPTED_IMAGE_TYPES.join(",")} onChange={pickImage} />
          </>
        )}
        <textarea
          ref={inputRef}
          className="composer-input"
          rows={1}
          placeholder={placeholder}
          aria-label="Message"
          value={text}
          maxLength={5000}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            setDismissed(false);
            emitTyping();
          }}
          onSelect={(e) => setCaret(e.target.selectionStart)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setDismissed(true), 150)}
          onFocus={() => setDismissed(false)}
          autoFocus
        />
        <button type="button" className="send-btn" onClick={send} disabled={!canSend} aria-label="Send message">
          {sending ? <span className="btn-spinner" /> : <i className="fa fa-paper-plane" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
