import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAllUser, getLoggedUser } from "../apiCalls/users";
import { useDispatch } from "react-redux";
import { hideLoader, showLoader } from "../redux/loaderSlice";
import toast from "react-hot-toast";
import { setAllUsers, setUser, setAllChats } from "../redux/userSlice";
import { getAllChats } from "../apiCalls/chat";

function ProtectedRoute({ children }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const getLoggedInUser = async () => {
    let response = null;
    try {
      dispatch(showLoader());
      response = await getLoggedUser();
      dispatch(hideLoader());
      if (response.success) {
        dispatch(setUser(response.data));
      } else {
        toast.error(response.message);
        navigate("/login");
      }
    } catch (error) {
      dispatch(hideLoader());
      navigate("/login");
    }
  };
  const getAllUsersFromDB = async () => {
    let response = null;
    try {
      dispatch(showLoader());
      response = await getAllUser();
      dispatch(hideLoader());
      if (response.success) {
        dispatch(setAllUsers(response.data));
      } else {
        toast.error(response.message);
        navigate("/login");
      }
    } catch (error) {
      dispatch(hideLoader());
      navigate("/login");
    }
  };
  const getCurrentUserChats = async () => {

    try {
      const response = await getAllChats();
      if(response.success){
        dispatch(setAllChats(response.data));
      }
    } catch (error) {
      navigate("/login");
    }
  };
  useEffect(() => {
    if (localStorage.getItem("token")) {
      getAllUsersFromDB();
      getLoggedInUser();
      getCurrentUserChats();
    } else {
      navigate("/login");
    }
  }, []);
  return <div>{children}</div>;
}
export default ProtectedRoute;
