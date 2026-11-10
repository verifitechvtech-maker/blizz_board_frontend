import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  MessageCircle,
  Search,
  Send,
  Users,
  RefreshCw,
  Building2,
  UserRound,
  AlertCircle,
} from "lucide-react";
import { API_URL as ENV_API_URL } from "../../config/env";

const API_URL = ENV_API_URL;

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

const getId = (item) => {
  if (!item) return "";
  if (typeof item === "string") return item;
  return String(item._id || item.id || item.conversationId || "");
};

const getList = (response, keys = []) => {
  const data = response?.data ?? response;

  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  if (Array.isArray(data?.data)) return data.data;

  return [];
};

const getUserName = (user) =>
  user?.name ||
  user?.fullName ||
  user?.user?.name ||
  user?.email ||
  "Unknown user";

const getDepartmentName = (user, departments = []) => {
  const department = user?.department || user?.departmentId;

  if (department && typeof department === "object") {
    return department.name || "Department not assigned";
  }

  if (department) {
    const match = departments.find(
      (item) =>
        getId(item) === String(department) ||
        item.name?.toLowerCase() === String(department).toLowerCase()
    );

    return match?.name || String(department);
  }

  return "Department not assigned";
};

const getConversationName = (conversation, currentUserId) => {
  if (conversation?.type === "department") {
    return conversation.department?.name || "Department group";
  }

  const participants = conversation?.participants || [];

  const otherParticipant = participants.find(
    (participant) => getId(participant) !== currentUserId
  );

  return (
    otherParticipant?.name ||
    otherParticipant?.email ||
    conversation?.title ||
    conversation?.name ||
    "Private conversation"
  );
};

const getCurrentUserId = () => {
  try {
    const currentUser =
      JSON.parse(localStorage.getItem("currentUser") || "null") ||
      JSON.parse(localStorage.getItem("user") || "null");

    return getId(currentUser);
  } catch {
    return "";
  }
};

export default function Chats() {
  const [users, setUsers] = useState([]);
  const [chatUsers, setChatUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);

  const [selectedConversation, setSelectedConversation] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [error, setError] = useState("");
  const [messageText, setMessageText] = useState("");

  const currentUserId = useMemo(() => getCurrentUserId(), []);

  // Load actual users, departments and conversations from the backend.
  const loadChatData = useCallback(async () => {
    setLoading(true);
    setError("");

    const results = await Promise.allSettled([
      api.get("/auth/users"),
      api.get("/departments"),
      api.get("/chat/users"),
      api.get("/chat/conversations"),
    ]);

    const [
      usersResult,
      departmentsResult,
      chatUsersResult,
      conversationsResult,
    ] = results;

    const errors = [];

    if (usersResult.status === "fulfilled") {
      setUsers(
        getList(usersResult.value, ["users"]).filter(
          (user) => getId(user) !== currentUserId
        )
      );
    } else {
      setUsers([]);
      errors.push("Unable to load users from /api/auth/users.");
    }

    if (departmentsResult.status === "fulfilled") {
      const response = departmentsResult.value;
      setDepartments(
        getList(response, ["departments"]).filter(
          (department) =>
            !department.status ||
            String(department.status).toLowerCase() === "active"
        )
      );
    } else {
      setDepartments([]);
      errors.push("Unable to load departments from /api/departments.");
    }

    if (chatUsersResult.status === "fulfilled") {
      setChatUsers(
        getList(chatUsersResult.value, ["users"]).filter(
          (user) => getId(user) !== currentUserId
        )
      );
    } else {
      setChatUsers([]);
      errors.push("Unable to load eligible chat users.");
    }

    if (conversationsResult.status === "fulfilled") {
      setConversations(
        getList(conversationsResult.value, ["conversations"])
      );
    } else {
      setConversations([]);
      errors.push("Unable to load conversations.");
    }

    if (errors.length) {
      setError(errors.join(" "));
    }

    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    loadChatData();
  }, [loadChatData]);

  // Only users returned by the chat API are eligible for private chat.
  // Enrich those users with the details from /api/auth/users.
  const eligibleUsers = useMemo(() => {
    return chatUsers.map((chatUser) => {
      const fullUser = users.find(
        (user) => getId(user) === getId(chatUser)
      );

      return {
        ...fullUser,
        ...chatUser,
        department:
          chatUser.department || fullUser?.department || null,
      };
    });
  }, [chatUsers, users]);

  const filteredUsers = useMemo(() => {
    const term = search.toLowerCase().trim();

    return eligibleUsers.filter((user) => {
      const name = getUserName(user).toLowerCase();
      const email = (user.email || "").toLowerCase();
      const department = getDepartmentName(user, departments).toLowerCase();

      return (
        name.includes(term) ||
        email.includes(term) ||
        department.includes(term)
      );
    });
  }, [eligibleUsers, departments, search]);

  const filteredConversations = useMemo(() => {
    const term = search.toLowerCase().trim();

    return conversations.filter((conversation) => {
      const name = getConversationName(
        conversation,
        currentUserId
      ).toLowerCase();

      return name.includes(term);
    });
  }, [conversations, currentUserId, search]);

  // Load messages for the selected conversation.
  const openConversation = async (conversation) => {
    const conversationId = getId(conversation);

    if (!conversationId) {
      setError("The selected conversation has no valid ID.");
      return;
    }

    setSelectedConversation(conversation);
    setMessages([]);
    setMessagesLoading(true);
    setMessageText("");
    setError("");

    try {
      const response = await api.get(
        `/chat/${conversationId}/messages`
      );

      setMessages(getList(response, ["messages"]));
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load messages. Please check your login and permissions."
      );
    } finally {
      setMessagesLoading(false);
    }
  };

  // Create or retrieve a private conversation with a real database user.
  const startPrivateChat = async (user) => {
    const userId = getId(user);

    if (!userId) {
      setError("The selected user has no valid ID.");
      return;
    }

    setStartingChat(true);
    setError("");

    try {
      const response = await api.post("/chat/private", { userId });

      const conversation =
        response.data?.conversation ||
        response.data?.data?.conversation ||
        response.data?.data;

      if (!getId(conversation)) {
        throw new Error(
          "The backend did not return a valid conversation."
        );
      }

      await loadChatData();
      await openConversation(conversation);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to start a private conversation."
      );
    } finally {
      setStartingChat(false);
    }
  };

  const getMessageText = (message) =>
    message?.text || message?.content || message?.message || "";

  const getMessageSender = (message) =>
    message?.sender?.name || message?.sender?.email || "User";

  return (
    <div className="chat-page">
      <style>{`
        .chat-page {
          display: flex;
          flex-direction: column;
          gap: 18px;
          min-height: 70vh;
          color: #1f2937;
          font-family: Arial, sans-serif;
        }

        .chat-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }

        .chat-heading h1 {
          margin: 0 0 6px;
          font-size: 27px;
        }

        .chat-heading p {
          margin: 0;
          color: #6b7280;
        }

        .chat-refresh {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #fff;
          cursor: pointer;
        }

        .chat-error {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 12px;
          color: #991b1b;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          overflow-wrap: anywhere;
        }

        .chat-layout {
          display: grid;
          grid-template-columns: minmax(250px, 330px) minmax(0, 1fr);
          min-height: 580px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
        }

        .chat-sidebar {
          min-width: 0;
          border-right: 1px solid #e5e7eb;
        }

        .chat-sidebar-header {
          padding: 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .chat-search {
          box-sizing: border-box;
          width: 100%;
          margin-top: 12px;
          padding: 11px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          outline-color: #18b3b2;
        }

        .chat-section-title {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 14px 16px 7px;
          color: #6b7280;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .chat-list {
          max-height: 250px;
          overflow-y: auto;
        }

        .chat-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 12px 16px;
          text-align: left;
          border: 0;
          background: white;
          cursor: pointer;
        }

        .chat-item:hover,
        .chat-item.selected {
          background: #e9fafa;
        }

        .chat-avatar {
          display: flex;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          color: #087f80;
          background: #d8f5f4;
          font-weight: 700;
        }

        .chat-item-content {
          min-width: 0;
        }

        .chat-item-name {
          font-weight: 600;
          overflow-wrap: anywhere;
        }

        .chat-item-subtitle {
          margin-top: 4px;
          color: #6b7280;
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .chat-main {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .chat-main-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .chat-main-header h2 {
          margin: 0;
          font-size: 17px;
        }

        .chat-main-header p {
          margin: 4px 0 0;
          color: #6b7280;
          font-size: 12px;
        }

        .chat-messages {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 12px;
          min-height: 250px;
          max-height: 440px;
          padding: 18px;
          overflow-y: auto;
        }

        .chat-message {
          align-self: flex-start;
          max-width: 82%;
          padding: 11px 13px;
          background: #f3f4f6;
          border-radius: 4px 12px 12px 12px;
          overflow-wrap: anywhere;
        }

        .chat-message-sender {
          margin-bottom: 5px;
          color: #087f80;
          font-size: 12px;
          font-weight: 700;
        }

        .chat-message-text {
          white-space: pre-wrap;
        }

        .chat-message-time {
          margin-top: 6px;
          color: #6b7280;
          font-size: 11px;
        }

        .chat-empty {
          display: flex;
          flex: 1;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 24px;
          text-align: center;
          color: #6b7280;
        }

        .chat-empty strong {
          color: #374151;
        }

        .chat-composer {
          display: flex;
          gap: 10px;
          padding: 14px;
          border-top: 1px solid #e5e7eb;
        }

        .chat-composer input {
          flex: 1;
          min-width: 0;
          padding: 11px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
        }

        .chat-send {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 10px 14px;
          border: 0;
          border-radius: 8px;
          color: white;
          background: #18a7a6;
          cursor: not-allowed;
          opacity: 0.65;
        }

        .chat-note {
          padding: 10px 14px;
          color: #92400e;
          background: #fffbeb;
          border-top: 1px solid #fde68a;
          font-size: 12px;
        }

        .chat-count {
          margin-left: auto;
          padding: 2px 7px;
          border-radius: 10px;
          background: #f3f4f6;
          font-size: 11px;
        }

        @media (max-width: 720px) {
          .chat-layout {
            grid-template-columns: 1fr;
          }

          .chat-sidebar {
            border-right: 0;
            border-bottom: 1px solid #e5e7eb;
          }

          .chat-list {
            max-height: 190px;
          }
        }
      `}</style>

      <div className="chat-heading">
        <div>
          <h1>Chats</h1>
          <p>Communicate with your organization.</p>
        </div>

        <button
          type="button"
          className="chat-refresh"
          onClick={loadChatData}
          disabled={loading}
        >
          <RefreshCw size={16} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="chat-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="chat-layout">
        <aside className="chat-sidebar">
          <div className="chat-sidebar-header">
            <strong>Messages</strong>

            <input
              className="chat-search"
              type="search"
              placeholder="Search users or conversations"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="chat-section-title">
            <MessageCircle size={15} />
            Conversations
            <span className="chat-count">
              {filteredConversations.length}
            </span>
          </div>

          <div className="chat-list">
            {loading ? (
              <div className="chat-empty">Loading conversations...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="chat-empty">No conversations found.</div>
            ) : (
              filteredConversations.map((conversation) => {
                const conversationId = getId(conversation);
                const title = getConversationName(
                  conversation,
                  currentUserId
                );

                return (
                  <button
                    type="button"
                    key={conversationId}
                    className={`chat-item ${
                      getId(selectedConversation) === conversationId
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => openConversation(conversation)}
                  >
                    <div className="chat-avatar">
                      {conversation.type === "department" ? (
                        <Building2 size={19} />
                      ) : (
                        title.charAt(0).toUpperCase()
                      )}
                    </div>

                    <div className="chat-item-content">
                      <div className="chat-item-name">{title}</div>
                      <div className="chat-item-subtitle">
                        {conversation.type === "department"
                          ? "Department group"
                          : conversation.lastMessage?.text ||
                            "Open conversation"}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="chat-section-title">
            <UserRound size={15} />
            Team members
            <span className="chat-count">{filteredUsers.length}</span>
          </div>

          <div className="chat-list">
            {loading ? (
              <div className="chat-empty">Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="chat-empty">
                No eligible chat users found.
              </div>
            ) : (
              filteredUsers.map((user) => (
                <button
                  type="button"
                  key={getId(user)}
                  className="chat-item"
                  onClick={() => startPrivateChat(user)}
                  disabled={startingChat}
                >
                  <div className="chat-avatar">
                    {getUserName(user).charAt(0).toUpperCase()}
                  </div>

                  <div className="chat-item-content">
                    <div className="chat-item-name">
                      {getUserName(user)}
                    </div>
                    <div className="chat-item-subtitle">
                      {getDepartmentName(user, departments)}
                    </div>
                    {user.email && (
                      <div className="chat-item-subtitle">
                        {user.email}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="chat-section-title">
            <Building2 size={15} />
            Departments
            <span className="chat-count">{departments.length}</span>
          </div>

          <div className="chat-list">
            {loading ? (
              <div className="chat-empty">Loading departments...</div>
            ) : departments.length === 0 ? (
              <div className="chat-empty">
                No active departments found.
              </div>
            ) : (
              departments.map((department) => (
                <div className="chat-item" key={getId(department)}>
                  <div className="chat-avatar">
                    <Building2 size={18} />
                  </div>
                  <div className="chat-item-content">
                    <div className="chat-item-name">
                      {department.name}
                    </div>
                    <div className="chat-item-subtitle">
                      {department.description || "Department"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="chat-main">
          {selectedConversation ? (
            <>
              <div className="chat-main-header">
                <div className="chat-avatar">
                  {selectedConversation.type === "department" ? (
                    <Building2 size={19} />
                  ) : (
                    getConversationName(
                      selectedConversation,
                      currentUserId
                    )
                      .charAt(0)
                      .toUpperCase()
                  )}
                </div>

                <div>
                  <h2>
                    {getConversationName(
                      selectedConversation,
                      currentUserId
                    )}
                  </h2>
                  <p>
                    {selectedConversation.type === "department"
                      ? "Department group conversation"
                      : "Private conversation"}
                  </p>
                </div>
              </div>

              <div className="chat-messages">
                {messagesLoading ? (
                  <div className="chat-empty">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="chat-empty">
                    <MessageCircle size={36} />
                    <strong>No messages yet</strong>
                    <span>
                      Messages will appear here once available.
                    </span>
                  </div>
                ) : (
                  messages.map((message, index) => (
                    <div
                      className="chat-message"
                      key={getId(message) || index}
                    >
                      <div className="chat-message-sender">
                        {getMessageSender(message)}
                      </div>

                      <div className="chat-message-text">
                        {getMessageText(message) ||
                          "[Message content unavailable]"}
                      </div>

                      {message.createdAt && (
                        <div className="chat-message-time">
                          {new Date(message.createdAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="chat-note">
                Message sending is not connected yet. The backend needs a
                send-message endpoint before this can be enabled.
              </div>

              <div className="chat-composer">
                <input
                  type="text"
                  placeholder="Sending messages is not available yet"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  disabled
                />

                <button
                  type="button"
                  className="chat-send"
                  disabled
                >
                  <Send size={16} />
                  Send
                </button>
              </div>
            </>
          ) : (
            <div className="chat-empty">
              <MessageCircle size={44} />
              <strong>Select a conversation</strong>
              <span>
                Choose an existing conversation or click a team member
                to start a private chat.
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
