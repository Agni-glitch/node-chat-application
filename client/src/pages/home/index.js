import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setSelectedChat } from "../../redux/userSlice";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/Chat";

export default function Home() {
  const dispatch = useDispatch();
  const { selectedChat, allChats, user } = useSelector((state) => state.userReducer);

  // Leaving the chat screen closes the open conversation (see redux/store.js).
  useEffect(() => () => dispatch(setSelectedChat(null)), [dispatch]);

  // Show the number of unread messages in the browser tab.
  const unread = allChats.reduce(
    (sum, c) => sum + (c.lastMessage && c.lastMessage.sender !== user?._id ? c.unreadMessageCount || 0 : 0),
    0
  );
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Quick Chat` : "Quick Chat";
    return () => {
      document.title = "Quick Chat";
    };
  }, [unread]);

  return (
    <div className="app-shell">
      <Header />
      <main className={`app-main ${selectedChat ? "has-chat" : ""}`}>
        <Sidebar />
        {selectedChat ? (
          <ChatArea />
        ) : (
          <section className="chat chat-placeholder">
            <div className="placeholder-art">
              <i className="fa fa-comments-o" aria-hidden="true" />
            </div>
            <h2>Welcome, {user?.firstname}</h2>
            <p>Pick a conversation on the left, or search for someone to start a new one.</p>
          </section>
        )}
      </main>
    </div>
  );
}
