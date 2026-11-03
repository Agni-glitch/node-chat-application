import reducer, { messageReceived, messagesRead, messagesDeleted, userUpdated, setSelectedChat, setUser, setAllChats, setAiBusy, chatRemoved, setTyping } from "./userSlice";

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

describe("AI chats", () => {
  const aiChat = { _id: "AI", type: "ai", members: [me], bot: { _id: "b1", name: "Alen" }, unreadMessageCount: 0 };
  const withAi = () => {
    let state = reducer(undefined, setUser(me));
    state = reducer(state, setAllChats([aiChat, chatA]));
    return reducer(state, setSelectedChat(aiChat));
  };

  test("the model reading a prompt only marks that prompt", () => {
    let state = withAi();
    state = reducer(state, messageReceived(msg("p1", "AI", "me", "2026-01-01T10:00:01Z")));
    state = reducer(state, messageReceived({ ...msg("r0", "AI", "me", "2026-01-01T10:00:00Z"), bot: { name: "Alen" } }));
    state = reducer(state, messagesRead({ chatId: "AI", readerId: "b1", readAt: "2026-01-01T10:00:02Z", messageIds: ["p1"] }));
    expect(state.messages.find((m) => m._id === "p1").readAt).toBe("2026-01-01T10:00:02Z");
    expect(state.messages.find((m) => m._id === "r0").read).toBe(false);
  });

  test("viewing an AI chat marks the model's replies (not my prompts) as seen", () => {
    let state = withAi();
    state = reducer(state, messageReceived(msg("p1", "AI", "me", "2026-01-01T10:00:01Z")));
    state = reducer(state, messageReceived({ ...msg("r1", "AI", "me", "2026-01-01T10:00:02Z"), bot: { name: "Alen" } }));
    state = reducer(state, messagesRead({ chatId: "AI", readerId: "me", readAt: "2026-01-01T10:00:03Z" }));
    expect(state.messages.find((m) => m._id === "r1").read).toBe(true);
    expect(state.messages.find((m) => m._id === "p1").read).toBe(false);
    expect(state.allChats.find((c) => c._id === "AI").unreadMessageCount).toBe(0);
  });

  test("ai-typing tracks which models are busy per chat", () => {
    let state = withAi();
    state = reducer(state, setAiBusy({ chatId: "A", bot: { name: "Alen" }, active: true }));
    state = reducer(state, setAiBusy({ chatId: "A", bot: { name: "Pix" }, active: true }));
    expect(state.aiBusy.A.map((b) => b.name)).toEqual(["Alen", "Pix"]);
    state = reducer(state, setAiBusy({ chatId: "A", bot: { name: "Alen" }, active: false }));
    state = reducer(state, setAiBusy({ chatId: "A", bot: { name: "Pix" }, active: false }));
    expect(state.aiBusy.A).toBeUndefined();
  });

  test("removing a chat closes it if it was open", () => {
    let state = withAi();
    state = reducer(state, chatRemoved("AI"));
    expect(state.selectedChat).toBeNull();
    expect(state.allChats.map((c) => c._id)).toEqual(["A"]);
  });
});

describe("group chats", () => {
  const group = { _id: "G", type: "group", name: "Trip", members: [me, { _id: "u1" }, { _id: "u2" }], unreadMessageCount: 0 };
  const withGroup = (open = true) => {
    let state = reducer(undefined, setUser(me));
    state = reducer(state, setAllChats([group, chatA]));
    return open ? reducer(state, setSelectedChat(group)) : state;
  };

  test("a reader is added to readBy; only messages seen by everyone get their timer", () => {
    let state = withGroup();
    state = reducer(state, messageReceived(msg("g1", "G", "me", "2026-01-01T10:00:01Z")));
    state = reducer(state, messagesRead({ chatId: "G", readerId: "u1", readAt: "2026-01-01T10:00:02Z", messageIds: [], group: true }));
    let m = state.messages[0];
    expect(m.readBy).toEqual(["u1"]);
    expect(m.read).toBe(false);
    state = reducer(state, messagesRead({ chatId: "G", readerId: "u2", readAt: "2026-01-01T10:00:03Z", messageIds: ["g1"], group: true }));
    m = state.messages[0];
    expect(m.readBy).toEqual(["u1", "u2"]);
    expect(m.read).toBe(true);
    expect(m.readAt).toBe("2026-01-01T10:00:03Z");
  });

  test("unread counts only other people's messages and not my own", () => {
    let state = withGroup(false);
    state = reducer(state, messageReceived(msg("g1", "G", "u1", "2026-01-01T10:00:01Z")));
    state = reducer(state, messageReceived(msg("g2", "G", "me", "2026-01-01T10:00:02Z")));
    state = reducer(state, messageReceived(msg("g3", "G", "u2", "2026-01-01T10:00:03Z")));
    expect(state.allChats.find((c) => c._id === "G").unreadMessageCount).toBe(2);
    state = reducer(state, messagesRead({ chatId: "G", readerId: "me", messageIds: [], group: true }));
    expect(state.allChats.find((c) => c._id === "G").unreadMessageCount).toBe(0);
  });

  test("typing remembers who is typing and clears when they send", () => {
    let state = withGroup();
    state = reducer(state, setTyping({ chatId: "G", value: "u1" }));
    expect(state.typing.G).toBe("u1");
    state = reducer(state, messageReceived(msg("g9", "G", "u2", "2026-01-01T10:00:05Z")));
    expect(state.typing.G).toBe("u1"); // someone else's message doesn't clear it
    state = reducer(state, messageReceived(msg("g10", "G", "u1", "2026-01-01T10:00:06Z")));
    expect(state.typing.G).toBeUndefined();
  });
});
