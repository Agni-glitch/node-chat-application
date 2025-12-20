import React from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/Chat";
import { useSelector } from "react-redux";
import { io } from "socket.io-client";
import { useEffect, useState } from "react";
const socket = io('https://quick-chat-app-server-a1ws.onrender.com');
export default function Home() {
  const { selectedChat, user } = useSelector(state => state.userReducer)
  const [onlineUsers, setOnlineUsers] = useState([])
  useEffect(() => {
    if (user) {
      socket.emit('join-room', user._id);
      socket.emit('user-login', user._id);
      socket.on('online-users', onlineUsers => {
        setOnlineUsers(onlineUsers)
      })
      socket.on('online-users-updated', onlineUsers => {
        setOnlineUsers(onlineUsers);
      })
    }
  }, [user, onlineUsers])
  return (
    <div className="home-page">
      <Header socket={socket} />
      <div className="main-content">
        <Sidebar socket={socket} onlineUsers={onlineUsers} />
        {selectedChat && <ChatArea socket={socket} />}
      </div>
    </div>
  );
}
