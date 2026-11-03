import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import { getAllUser, getAppConfig, getLoggedUser } from "../apiCalls/users";
import { getAllChats } from "../apiCalls/chat";
import { getBots } from "../apiCalls/bots";
import { clearToken, getToken } from "../apiCalls";
import { setAllChats, setAllUsers, setAppConfig, setBots, setUser } from "../redux/userSlice";
import Loader from "./Loader";
import useChatSocket from "../hooks/useChatSocket";

export default function ProtectedRoute({ children }) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.userReducer.user);
  const [status, setStatus] = useState(user ? "ready" : "loading");
  const hasToken = Boolean(getToken());

  useEffect(() => {
    if (!hasToken || user) return;
    let cancelled = false;
    (async () => {
      const [me, users, chats, appConfig, bots] = await Promise.all([
        getLoggedUser(),
        getAllUser(),
        getAllChats(),
        getAppConfig(),
        getBots(),
      ]);
      if (cancelled) return;
      if (appConfig.success) dispatch(setAppConfig(appConfig.data));
      if (!me.success) {
        clearToken();
        toast.error(me.message || "Please log in again");
        setStatus("unauthenticated");
        return;
      }
      dispatch(setUser(me.data));
      if (users.success) dispatch(setAllUsers(users.data));
      if (chats.success) dispatch(setAllChats(chats.data));
      if (bots.success) dispatch(setBots(bots.data));
      if (!users.success || !chats.success) toast.error("Some data could not be loaded. Try refreshing.");
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, hasToken, user]);

  if (!hasToken || status === "unauthenticated") return <Navigate to="/login" replace />;
  if (!user) return <Loader label="Loading your chats" />;
  return (
    <>
      <RealtimeBridge />
      {children}
    </>
  );
}

/** Keeps the socket listeners alive on every authenticated page. */
function RealtimeBridge() {
  useChatSocket();
  return null;
}
