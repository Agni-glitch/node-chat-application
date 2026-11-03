import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { createBot, deleteBot, openBotChat, testBot, updateBot } from "../../apiCalls/bots";
import { botRemoved, botSaved, chatAdded, chatRemoved, setSelectedChat } from "../../redux/userSlice";
import Header from "../home/components/Header";
import BotAvatar from "../../components/BotAvatar";

const PROVIDERS = [
  { value: "openai", label: "OpenAI", chat: "e.g. gpt-5.5", image: "e.g. gpt-image-1 or dall-e-3", keyHint: "sk-…" },
  { value: "anthropic", label: "Anthropic (Claude)", chat: "e.g. claude-sonnet-4-5", image: null, keyHint: "sk-ant-…" },
  { value: "gemini", label: "Google Gemini", chat: "e.g. gemini-2.5-flash", image: "e.g. gemini-2.5-flash-image or imagen-4.0-generate-001", keyHint: "AIza…" },
  {
    value: "openai-compatible",
    label: "OpenAI-compatible (OpenRouter, Groq, Together, Ollama…)",
    chat: "e.g. meta-llama/llama-3.3-70b-instruct",
    image: "the provider's image model id",
    keyHint: "optional for local servers",
  },
];

const EMPTY = { name: "", kind: "chat", provider: "openai", model: "", baseUrl: "", apiKey: "", instructions: "" };

export default function Models() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { bots, allChats, appConfig } = useSelector((state) => state.userReducer);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const provider = PROVIDERS.find((p) => p.value === form.provider);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const startAdd = () => {
    setForm(EMPTY);
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (bot) => {
    setForm({ ...EMPTY, ...bot, baseUrl: bot.baseUrl || "", apiKey: "", instructions: bot.instructions || "" });
    setEditingId(bot._id);
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form };
    if (editingId && !payload.apiKey) delete payload.apiKey; // keep the stored key
    const res = editingId ? await updateBot(editingId, payload) : await createBot(payload);
    setSaving(false);
    if (!res.success) return toast.error(res.message || "Could not save the model");
    dispatch(botSaved(res.data));
    toast.success(res.message);
    setShowForm(false);
    setForm(EMPTY);
  };

  const remove = async (bot) => {
    if (!window.confirm(`Delete @${bot.name}? Its private chat and messages will be deleted too.`)) return;
    setBusyId(bot._id);
    const res = await deleteBot(bot._id);
    setBusyId(null);
    if (!res.success) return toast.error(res.message);
    allChats.filter((c) => c.type === "ai" && c.bot?._id === bot._id).forEach((c) => dispatch(chatRemoved(c._id)));
    dispatch(botRemoved(bot._id));
    toast.success(res.message);
  };

  const test = async (bot) => {
    setBusyId(bot._id);
    const res = await testBot(bot._id);
    setBusyId(null);
    if (res.success) toast.success(`@${bot.name}: ${res.data.reply}`, { duration: 6000 });
    else toast.error(res.message || "Test failed", { duration: 6000 });
  };

  const chat = async (bot) => {
    setBusyId(bot._id);
    const res = await openBotChat(bot._id);
    setBusyId(null);
    if (!res.success) return toast.error(res.message);
    dispatch(chatAdded(res.data));
    navigate("/");
    // Select after Home mounts (leaving a page clears the open chat).
    setTimeout(() => dispatch(setSelectedChat(res.data)), 0);
  };

  return (
    <div className="app-shell">
      <Header />
      <main className="profile-page">
        <Link to="/" className="back-link">
          <i className="fa fa-arrow-left" aria-hidden="true" /> Back to chats
        </Link>
        <div className="models-card">
          <div className="models-head">
            <div>
              <h1 className="models-title">Your AI models</h1>
              <p className="models-sub">
                Add chat or image models with your own API key. Chat with them directly, or call them in any
                conversation by typing <span className="mention">@Name</span>. Only you can call your models, and their
                replies disappear like every other seen message.
              </p>
            </div>
            {!showForm && appConfig.aiEnabled !== false && (
              <button type="button" className="btn btn-primary" onClick={startAdd}>
                <i className="fa fa-plus" aria-hidden="true" /> Add model
              </button>
            )}
          </div>

          {appConfig.aiEnabled === false && (
            <div className="notice-warn">AI models are disabled on this server. Ask the admin to set AI_KEYS_SECRET.</div>
          )}

          {showForm && (
            <form className="model-form" onSubmit={save}>
              <h2 className="section-label">{editingId ? `Edit @${form.name}` : "New AI model"}</h2>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="m-name">Name (used as @mention)</label>
                  <input id="m-name" value={form.name} onChange={set("name")} placeholder="Alen" maxLength={30} required autoFocus />
                </div>
                <div className="field">
                  <span className="field-label">Type</span>
                  <div className="segmented" role="radiogroup" aria-label="Model type">
                    {["chat", "image"].map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={form.kind === k}
                        className={form.kind === k ? "is-active" : ""}
                        onClick={() =>
                          setForm({ ...form, kind: k, provider: k === "image" && form.provider === "anthropic" ? "openai" : form.provider })
                        }
                      >
                        <i className={`fa ${k === "image" ? "fa-paint-brush" : "fa-comments"}`} aria-hidden="true" />{" "}
                        {k === "image" ? "Image" : "Chat"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="field">
                <label htmlFor="m-provider">Provider</label>
                <select id="m-provider" value={form.provider} onChange={set("provider")}>
                  {PROVIDERS.filter((p) => form.kind === "chat" || p.image).map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              {form.provider === "openai-compatible" && (
                <div className="field">
                  <label htmlFor="m-base">Base URL</label>
                  <input
                    id="m-base"
                    value={form.baseUrl}
                    onChange={set("baseUrl")}
                    placeholder="https://openrouter.ai/api/v1"
                    inputMode="url"
                    required
                  />
                  <small className="field-hint">The URL that comes before /chat/completions.</small>
                </div>
              )}
              <div className="field">
                <label htmlFor="m-model">Model id</label>
                <input
                  id="m-model"
                  value={form.model}
                  onChange={set("model")}
                  placeholder={form.kind === "image" ? provider?.image : provider?.chat}
                  maxLength={100}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="m-key">API key</label>
                <input
                  id="m-key"
                  type="password"
                  autoComplete="off"
                  value={form.apiKey}
                  onChange={set("apiKey")}
                  placeholder={editingId ? "Leave blank to keep the current key" : provider?.keyHint}
                  required={!editingId && form.provider !== "openai-compatible"}
                />
                <small className="field-hint">
                  <i className="fa fa-lock" aria-hidden="true" /> Encrypted on the server and never shown again. Usage is billed to
                  your account with the provider.
                </small>
              </div>
              {form.kind === "chat" && (
                <div className="field">
                  <label htmlFor="m-instructions">Personality / instructions (optional)</label>
                  <textarea
                    id="m-instructions"
                    rows={3}
                    maxLength={1000}
                    value={form.instructions}
                    onChange={set("instructions")}
                    placeholder="You are a witty travel expert who answers with one emoji."
                  />
                </div>
              )}
              <div className="profile-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="btn-spinner" /> : editingId ? "Save changes" : "Add model"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {bots.length === 0 && !showForm ? (
            <div className="empty-list">
              <i className="fa fa-android" aria-hidden="true" />
              <p>No AI models yet. Add one to chat with it or call it with @Name.</p>
            </div>
          ) : (
            <ul className="model-list">
              {bots.map((bot) => (
                <li key={bot._id} className="model-item">
                  <BotAvatar bot={bot} size={48} />
                  <div className="model-info">
                    <div className="model-name">
                      @{bot.name} <span className={`chip ${bot.kind === "image" ? "chip-accent" : "chip-ai"}`}>{bot.kind}</span>
                    </div>
                    <div className="model-meta">
                      {PROVIDERS.find((p) => p.value === bot.provider)?.label.split(" (")[0]} · {bot.model}
                      {bot.apiKeyLast4 && <> · key ••••{bot.apiKeyLast4}</>}
                    </div>
                  </div>
                  <div className="model-actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => chat(bot)} disabled={busyId === bot._id}>
                      <i className="fa fa-comment" aria-hidden="true" /> Chat
                    </button>
                    {bot.kind === "chat" && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => test(bot)} disabled={busyId === bot._id}>
                        {busyId === bot._id ? <span className="btn-spinner" /> : "Test"}
                      </button>
                    )}
                    <button type="button" className="icon-btn" onClick={() => startEdit(bot)} aria-label={`Edit @${bot.name}`}>
                      <i className="fa fa-pencil" aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-btn danger" onClick={() => remove(bot)} aria-label={`Delete @${bot.name}`}>
                      <i className="fa fa-trash" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
