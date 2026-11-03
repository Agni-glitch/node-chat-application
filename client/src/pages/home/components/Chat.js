import React, { Fragment, Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import { createNewMessage, getAllMessage } from "../../../apiCalls/message";
import { clearUnreadMessageCount } from "../../../apiCalls/chat";
import { messageReceived, messagesRead, setMessages, setMessagesLoading, setSelectedChat } from "../../../redux/userSlice";
import { getSocket } from "../../../socket";
import Avatar from "../../../components/Avatar";
import Loader from "../../../components/Loader";
import ContactPanel from "./ContactPanel";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "../../../config";
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

export default function ChatArea() {
  const dispatch = useDispatch();
  const { selectedChat, user, messages: allMessages, messagesLoading, onlineUsers, typing, appConfig } = useSelector(
    (state) => state.userReducer
  );
  const chatId = selectedChat._id;
  const me = user._id;
  const other = otherMember(selectedChat, me);
  const isOnline = other && onlineUsers.includes(other._id);
  const isTyping = Boolean(typing[chatId]);
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
      if (res.data.some((m) => m.sender !== me && !m.read)) {
        const cleared = await clearUnreadMessageCount(chatId);
        if (!cancelled && cleared.success) dispatch(messagesRead({ chatId, readerId: me }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, me, dispatch]);

  // Keep the newest message in view.
  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, isTyping, chatId]);

  if (!other) return null;

  return (
    <section className="chat" aria-label={`Conversation with ${formatName(other)}`}>
      <div className="chat-header">
        <button
          type="button"
          className="icon-btn chat-back"
          onClick={() => dispatch(setSelectedChat(null))}
          aria-label="Back to conversations"
        >
          <i className="fa fa-arrow-left" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="chat-header-contact"
          onClick={() => setShowContact(true)}
          title="View contact info"
        >
          <Avatar user={other} size={40} online={isOnline} />
          <span className="chat-header-text">
            <span className="chat-header-name">{formatName(other)}</span>
            <span className={`chat-header-status ${isTyping ? "is-typing" : ""}`}>
              {isTyping ? "typing…" : isOnline ? "Online" : "Offline"}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="icon-btn chat-info-btn"
          onClick={() => setShowContact(true)}
          aria-label="Contact info"
        >
          <i className="fa fa-info-circle" aria-hidden="true" />
        </button>
      </div>
      {showContact && (
        <ContactPanel user={other} online={isOnline} onClose={() => setShowContact(false)} />
      )}

      <div className="chat-messages" ref={scrollRef} aria-live="polite">
        <div className="ephemeral-notice">
          <i className="fa fa-clock-o" aria-hidden="true" /> Seen messages disappear after {ttlLabel}, and as soon as
          either of you closes the chat.
        </div>
        {messagesLoading && messages.length === 0 ? (
          <Loader fullscreen={false} label="Loading messages" />
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <Avatar user={other} size={72} />
            <p>
              No messages here right now. Say something to <strong>{formatName(other)}</strong>!
            </p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const mine = msg.sender === me;
            const prev = messages[i - 1];
            const newDay = !prev || !sameDay(prev.createdAt, msg.createdAt);
            const grouped = !newDay && prev && prev.sender === msg.sender;
            return (
              <Fragment key={msg._id}>
                {newDay && (
                  <div className="day-separator">
                    <span>{formatDayLabel(msg.createdAt)}</span>
                  </div>
                )}
                <div className={`message-row ${mine ? "is-mine" : ""} ${grouped ? "is-grouped" : ""}`}>
                  <div className="bubble">
                    {msg.image && (
                      <a href={msg.image} target="_blank" rel="noopener noreferrer" className="bubble-image">
                        <img src={msg.image} alt="Shared attachment" loading="lazy" />
                      </a>
                    )}
                    {msg.text && <p className="bubble-text">{msg.text}</p>}
                    <span className="bubble-meta">
                      {msg.readAt && (
                        <span className="bubble-timer" title="Disappears soon">
                          <i className="fa fa-hourglass-half" aria-hidden="true" />
                          {formatCountdown(expiresIn(msg))}
                        </span>
                      )}
                      {formatMessageTime(msg.createdAt)}
                      {mine && (
                        <i
                          className={`fa ${msg.read ? "fa-check-circle is-read" : "fa-check"}`}
                          title={msg.read ? "Seen" : "Sent"}
                          aria-label={msg.read ? "Seen" : "Sent"}
                        />
                      )}
                    </span>
                  </div>
                </div>
              </Fragment>
            );
          })
        )}
        {isTyping && (
          <div className="message-row">
            <div className="bubble typing-bubble" aria-label={`${formatName(other)} is typing`}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <Composer key={chatId} chatId={chatId} onSent={(m) => dispatch(messageReceived(m))} />
    </section>
  );
}

function Composer({ chatId, onSent }) {
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const lastTypingEmit = useRef(0);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  // Auto-grow the textarea up to a few lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  useEffect(() => {
    if (!showEmoji) return;
    const onKey = (e) => e.key === "Escape" && setShowEmoji(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showEmoji]);

  const emitTyping = () => {
    const now = Date.now();
    if (now - lastTypingEmit.current > TYPING_THROTTLE_MS) {
      lastTypingEmit.current = now;
      getSocket().emit("user-typing", { chatId });
    }
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
    setImage(null);
    onSent(res.data);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const canSend = (text.trim() || image) && !sending;

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
        <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Attach image">
          <i className="fa fa-paperclip" aria-hidden="true" />
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          onChange={pickImage}
        />
        <textarea
          ref={inputRef}
          className="composer-input"
          rows={1}
          placeholder="Type a message"
          aria-label="Message"
          value={text}
          maxLength={5000}
          onChange={(e) => {
            setText(e.target.value);
            emitTyping();
          }}
          onKeyDown={onKeyDown}
          autoFocus
        />
        <button type="button" className="send-btn" onClick={send} disabled={!canSend} aria-label="Send message">
          {sending ? <span className="btn-spinner" /> : <i className="fa fa-paper-plane" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
