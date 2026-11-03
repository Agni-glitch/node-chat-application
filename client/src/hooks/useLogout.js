import { useCallback } from "react";
import { useDispatch, useStore } from "react-redux";
import { useNavigate } from "react-router-dom";
import { clearToken } from "../apiCalls";
import { closeChat } from "../apiCalls/chat";
import { disconnectSocket } from "../socket";
import { resetState } from "../redux/userSlice";

export default function useLogout() {
  const dispatch = useDispatch();
  const store = useStore();
  const navigate = useNavigate();
  return useCallback(async () => {
    // Logging out closes the open chat, which deletes its seen messages.
    const openChatId = store.getState().userReducer.selectedChat?._id;
    if (openChatId) await closeChat(openChatId);
    clearToken();
    disconnectSocket(); // the server marks the user offline when the socket closes
    dispatch(resetState());
    navigate("/login", { replace: true });
  }, [dispatch, navigate, store]);
}
