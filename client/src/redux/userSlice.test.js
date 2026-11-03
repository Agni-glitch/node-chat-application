import reducer, { messageReceived, messagesRead, messagesDeleted, userUpdated, setSelectedChat, setUser, setAllChats } from "./userSlice";

const me = { _id: "me" };
const chatA = { _id: "A", members: [me, { _id: "u1" }], unreadMessageCount: 0 };
const chatB = { _id: "B", members: [me, { _id: "u2" }], unreadMessageCount: 0 };

const setup = () => {
  let state = reducer(undefined, setUser(me));
  state = reducer(state, setAllChats([chatA, chatB]));
  return state;
};

const msg = (id, chatId, sender, createdAt = new Date().toISOString()) => ({
  _id: id,
  chatId,
  sender,
  text: "hi",
  createdAt,
  read: false,
});

test("incoming message for a background chat increments unread and moves it to the top", () => {
  const state = reducer(setup(), messageReceived(msg("m1", "B", "u2")));
  expect(state.allChats[0]._id).toBe("B");
  expect(state.allChats[0].unreadMessageCount).toBe(1);
  expect(state.messages).toHaveLength(0);
});

test("incoming message for the open chat is appended once and does not count as unread", () => {
  let state = reducer(setup(), setSelectedChat(chatA));
  const m = msg("m1", "A", "u1");
  state = reducer(state, messageReceived(m));
  state = reducer(state, messageReceived(m)); // duplicate socket event
  expect(state.messages).toHaveLength(1);
  expect(state.allChats[0].unreadMessageCount).toBe(0);
});

test("a stale echo does not overwrite a newer last message", () => {
  let state = setup();
  state = reducer(state, messageReceived(msg("m2", "A", "me", "2026-01-01T10:00:02Z")));
  state = reducer(state, messageReceived(msg("m1", "A", "me", "2026-01-01T10:00:01Z")));
  expect(state.allChats.find((c) => c._id === "A").lastMessage._id).toBe("m2");
});

test("messagesRead by the other member marks my messages as read", () => {
  let state = reducer(setup(), setSelectedChat(chatA));
  state = reducer(state, messageReceived(msg("m1", "A", "me")));
  state = reducer(state, messagesRead({ chatId: "A", readerId: "u1" }));
  expect(state.messages[0].read).toBe(true);
  expect(state.allChats[0].lastMessage.read).toBe(true);
});

test("messagesRead by me starts the disappearing timer on the other member's messages", () => {
  let state = reducer(setup(), setSelectedChat(chatA));
  state = reducer(state, messageReceived(msg("m1", "A", "u1")));
  state = reducer(state, messagesRead({ chatId: "A", readerId: "me", readAt: "2026-01-01T10:00:00Z" }));
  expect(state.messages[0].read).toBe(true);
  expect(state.messages[0].readAt).toBe("2026-01-01T10:00:00Z");
});

test("messagesDeleted removes messages and updates the chat preview", () => {
  let state = reducer(setup(), setSelectedChat(chatA));
  state = reducer(state, messageReceived(msg("m1", "A", "u1", "2026-01-01T10:00:01Z")));
  state = reducer(state, messageReceived(msg("m2", "A", "me", "2026-01-01T10:00:02Z")));
  state = reducer(state, messagesDeleted({ chatId: "A", messageIds: ["m2"], lastMessage: state.messages[0] }));
  expect(state.messages.map((m) => m._id)).toEqual(["m1"]);
  expect(state.allChats.find((c) => c._id === "A").lastMessage._id).toBe("m1");
  state = reducer(state, messagesDeleted({ chatId: "A", messageIds: ["m1"], lastMessage: null }));
  expect(state.messages).toHaveLength(0);
  expect(state.allChats.find((c) => c._id === "A").lastMessage).toBeNull();
});

test("userUpdated refreshes the user everywhere they appear", () => {
  let state = reducer(setup(), setSelectedChat(chatA));
  state = reducer(state, userUpdated({ _id: "u1", socialLinks: { github: "https://github.com/u1" } }));
  expect(state.allChats[0].members[1].socialLinks.github).toBe("https://github.com/u1");
  expect(state.selectedChat.members[1].socialLinks.github).toBe("https://github.com/u1");
});
