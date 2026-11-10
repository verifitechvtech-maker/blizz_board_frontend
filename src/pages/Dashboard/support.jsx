import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pagination, usePagination } from "../../components/Pagination";

import {
  Search,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Send,
  FileText,
  RefreshCw,
  LifeBuoy,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import SupportTicketThread from "./SupportTicketThread";
import { FAQS, FAQ_CATEGORIES } from "../../data/faqs";
import { API_URL as ENV_API_URL } from "../../config/env";



const API_URL = `${ENV_API_URL}/support`;

const getToken = () => localStorage.getItem("token");

const Support = () => {
  const [search, setSearch] = useState("");
  const [openFaq, setOpenFaq] = useState(null);

  const [faqCategory, setFaqCategory] = useState("All");

  const [tickets, setTickets] = useState([]);
  const [openTicket, setOpenTicket] = useState(null); // conversation shown for this ticket
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState("");

  const [showTicket, setShowTicket] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ticketSent, setTicketSent] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [ticketRef, setTicketRef] = useState("");

  const [ticket, setTicket] = useState({
    subject: "",
    category: "General Support",
    priority: "Medium",
    message: "",
  });

  const getHeaders = useCallback(() => {
    const token = getToken();

    return token
      ? { Authorization: `Bearer ${token}` }
      : {};
  }, []);

  const readResponse = async (response) => {
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new Error(
        data.message || `Request failed (${response.status})`
      );
    }

    return data;
  };

  // Load the current user's tickets
  const fetchTickets = useCallback(async () => {
    setTicketsLoading(true);
    setTicketsError("");

    try {
      const response = await fetch(`${API_URL}/tickets`, {
        headers: getHeaders(),
      });

      const data = await readResponse(response);

      setTickets(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      setTicketsError(error.message || "Unable to load tickets.");
    } finally {
      setTicketsLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const filteredFaqs = useMemo(() => {
    const query = search.trim().toLowerCase();

    const inCategory = faqCategory === "All"
      ? FAQS
      : FAQS.filter((faq) => faq.category === faqCategory);

    if (!query) return inCategory;

    return inCategory.filter((faq) => {
      const question = String(faq.question || "").toLowerCase();
      const answer = String(faq.answer || "").toLowerCase();

      return question.includes(query) || answer.includes(query);
    });
  }, [search, faqCategory]);

  const faqPage = usePagination(filteredFaqs, { id: "faqs", resetKey: `${search}|${faqCategory}` });
  const ticketPage = usePagination(tickets, { id: "my-tickets" });

  const handleTicketChange = (event) => {
    const { name, value } = event.target;

    setTicket((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const closeTicketModal = () => {
    if (submitting) return;

    setShowTicket(false);
    setTicketError("");
    setTicketSent(false);
    setTicketRef("");
  };

  const submitTicket = async (event) => {
    event.preventDefault();

    if (!ticket.subject.trim() || !ticket.message.trim()) {
      setTicketError("Please enter both a subject and description.");
      return;
    }

    if (!getToken()) {
      setTicketError("Please log in again to create a support ticket.");
      return;
    }

    setSubmitting(true);
    setTicketError("");

    try {
      const response = await fetch(`${API_URL}/tickets`, {
        method: "POST",
        headers: {
          ...getHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...ticket,
          subject: ticket.subject.trim(),
          message: ticket.message.trim(),
        }),
      });

      const data = await readResponse(response);

      setTicketRef(data.data?.ticketId || "");
      setTicketSent(true);

      setTicket({
        subject: "",
        category: "General Support",
        priority: "Medium",
        message: "",
      });

      await fetchTickets();
    } catch (error) {
      setTicketError(error.message || "Failed to create support ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityClass = (priority) =>
    `priority-${String(priority || "medium").toLowerCase()}`;

  const getStatusClass = (status) =>
    `status-${String(status || "open")
      .toLowerCase()
      .replace(/\s+/g, "-")}`;

  return (
    <div className="support-page">
      <style>{`
        .support-page {
          min-height: calc(100vh - 100px);
          padding: 28px;
          box-sizing: border-box;
          background: #f5f9fc;
          color: #183449;
        }

        .support-container {
          width: 100%;
          max-width: 1250px;
          margin: 0 auto;
        }

        .support-header {
          padding: 30px;
          margin-bottom: 22px;
          border-radius: 20px;
          background: linear-gradient(120deg, #073b4c, #087f8c);
          color: white;
        }

        .support-heading {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .support-heading-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 13px;
          background: rgba(255,255,255,.14);
        }

        .support-header h1 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
        }

        .support-header p {
          margin: 7px 0 0;
          color: #d7eef1;
          font-size: 13px;
          line-height: 1.6;
        }

        .support-search-wrap {
          position: relative;
          margin-top: 24px;
        }

        .support-search-icon {
          position: absolute;
          top: 14px;
          left: 15px;
          color: #71899a;
        }

        .support-search {
          width: 100%;
          height: 46px;
          box-sizing: border-box;
          padding: 0 15px 0 44px;
          border: 1px solid #dce7ed;
          border-radius: 11px;
          outline: none;
          background: white;
          color: #183449;
          font-size: 13px;
        }

        .support-search:focus,
        .support-form input:focus,
        .support-form select:focus,
        .support-form textarea:focus {
          border-color: #078995;
          box-shadow: 0 0 0 3px rgba(7,137,149,.1);
        }

        .support-panel {
          margin-bottom: 22px;
          overflow: hidden;
          border: 1px solid #e0e9ef;
          border-radius: 17px;
          background: white;
          box-shadow: 0 5px 20px rgba(26,65,88,.04);
        }

        .support-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 20px 22px;
          border-bottom: 1px solid #edf1f4;
        }

        .support-panel-title {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .support-title-icon {
          width: 39px;
          height: 39px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          color: #087f8c;
          background: #e6f7f7;
        }

        .support-panel-header h2 {
          margin: 0;
          font-size: 16px;
          color: #183449;
        }

        .support-panel-header p {
          margin: 4px 0 0;
          color: #8194a1;
          font-size: 12px;
        }

        .support-primary-button,
        .support-refresh-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 38px;
          padding: 0 14px;
          border: none;
          border-radius: 9px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
        }

        .support-primary-button {
          background: #087f8c;
          color: white;
        }

        .support-primary-button:hover {
          background: #066975;
        }

        .support-primary-button:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        .support-refresh-button {
          color: #087f8c;
          background: #edf8f9;
          border: 1px solid #d9ebee;
        }

        .support-faq-list {
          padding: 4px 20px;
        }

        .support-faq-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 14px 20px 4px;
        }

        .support-faq-chip {
          border: 1px solid #d9ebee;
          background: #f6fbfc;
          color: #4d6a7a;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .support-faq-chip:hover {
          color: #087f8c;
        }

        .support-faq-chip.active {
          background: #087f8c;
          border-color: #087f8c;
          color: #fff;
        }

        .support-faq-item {
          border-bottom: 1px solid #edf1f4;
        }

        .support-faq-item:last-child {
          border-bottom: none;
        }

        .support-faq-question {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 17px 2px;
          border: none;
          background: transparent;
          color: #28475b;
          text-align: left;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .support-faq-question:hover {
          color: #087f8c;
        }

        .support-faq-answer {
          padding: 0 30px 17px 2px;
          color: #708695;
          font-size: 13px;
          line-height: 1.8;
          white-space: pre-wrap;
        }

        .support-state {
          padding: 35px 20px;
          text-align: center;
          color: #7b909e;
          font-size: 13px;
        }

        .support-error {
          color: #b83232;
        }

        .support-state button {
          margin-top: 12px;
        }

        .support-tickets {
          display: grid;
          gap: 10px;
          padding: 16px 20px 20px;
        }

        .support-ticket-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 15px;
          border: 1px solid #e3edf1;
          border-radius: 12px;
          background: #fcfeff;
        }

        .support-ticket-main {
          min-width: 0;
        }

        .support-ticket-subject {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 9px;
          color: #24455a;
          font-size: 13px;
          font-weight: 700;
          overflow-wrap: anywhere;
        }

        .support-ticket-id {
          padding: 4px 7px;
          border-radius: 6px;
          background: #e4f7f7;
          color: #087f8c;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }

        .support-ticket-meta {
          margin-top: 7px;
          color: #8498a5;
          font-size: 11px;
        }

        .support-ticket-badges {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          flex-shrink: 0;
        }

        .support-badge {
          padding: 5px 9px;
          border-radius: 30px;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }

        .priority-low {
          background: #eef3f5;
          color: #587284;
        }

        .priority-medium {
          background: #e7f1ff;
          color: #2368a3;
        }

        .priority-high {
          background: #fff0df;
          color: #a96600;
        }

        .priority-urgent {
          background: #fde9e8;
          color: #bd332c;
        }

        .status-open {
          background: #e7f1ff;
          color: #2368a3;
        }

        .status-in-progress {
          background: #fff4d9;
          color: #956c0a;
        }

        .status-resolved {
          background: #e2f8ef;
          color: #0b8c6c;
        }

        .status-closed {
          background: #eef3f5;
          color: #718695;
        }

        .support-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          box-sizing: border-box;
          background: rgba(8,35,48,.62);
          backdrop-filter: blur(4px);
        }

        .support-modal {
          width: 100%;
          max-width: 580px;
          max-height: calc(100vh - 36px);
          overflow-y: auto;
          border-radius: 18px;
          background: white;
          box-shadow: 0 25px 70px rgba(0,0,0,.22);
        }

        .support-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 20px 23px;
          border-bottom: 1px solid #e8eef1;
        }

        .support-modal-heading {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .support-modal-heading h2 {
          margin: 0;
          color: #183449;
          font-size: 17px;
        }

        .support-close-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 9px;
          background: #f0f5f7;
          color: #637b89;
          cursor: pointer;
        }

        .support-form {
          padding: 22px;
        }

        .support-form-group {
          margin-bottom: 17px;
        }

        .support-form label {
          display: block;
          margin-bottom: 7px;
          color: #28475b;
          font-size: 12px;
          font-weight: 700;
        }

        .support-form input,
        .support-form select,
        .support-form textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 11px 12px;
          border: 1px solid #d8e5eb;
          border-radius: 9px;
          outline: none;
          color: #24455a;
          background: #fcfeff;
          font: inherit;
          font-size: 13px;
        }

        .support-form input,
        .support-form select {
          height: 43px;
        }

        .support-form textarea {
          min-height: 120px;
          resize: vertical;
        }

        .support-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .support-form-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-top: 6px;
        }

        .support-cancel-button {
          min-height: 38px;
          padding: 0 15px;
          border: none;
          border-radius: 9px;
          background: #eef3f5;
          color: #587284;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .support-alert {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          margin: 16px 22px 0;
          padding: 12px;
          border-radius: 10px;
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .support-alert-success {
          background: #e7f8f0;
          border: 1px solid #c7ebdb;
          color: #087b5e;
        }

        .support-alert-error {
          background: #fff0ef;
          border: 1px solid #f3d0cd;
          color: #ad332c;
        }

        @media (max-width: 650px) {
          .support-page {
            padding: 16px 12px;
          }

          .support-header {
            padding: 22px 17px;
          }

          .support-header h1 {
            font-size: 22px;
          }

          .support-panel-header {
            padding: 16px;
          }

          .support-panel-header h2 {
            font-size: 14px;
          }

          .support-panel-header p {
            line-height: 1.5;
          }

          .support-form-row {
            grid-template-columns: 1fr;
            gap: 0;
          }

          .support-ticket-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .support-ticket-badges {
            flex-shrink: 1;
          }

          .support-faq-list {
            padding: 4px 14px;
          }

          .support-modal-header,
          .support-form {
            padding: 17px;
          }

          .support-alert {
            margin-right: 17px;
            margin-left: 17px;
          }
        }

        /* ===== shared theme (matches Dashboard / Users / Tasks) ===== */
        .support-page .support-header {
          background: var(--ts-hero);
          border: var(--ts-hero-border);
          box-shadow: var(--ts-hero-shadow);
          color: var(--ts-on-hero);
        }
        .support-page .support-panel-header h2 { font-weight: 800; color: var(--ts-text); }

      `}</style>

      <div className="support-container">
        <header className="support-header">
          <div className="support-heading">
            <div className="support-heading-icon">
              <LifeBuoy size={25} />
            </div>

            <div>
              <h1>Support Center</h1>
              <p>
                Find answers to your questions or create a ticket for
                assistance.
              </p>
            </div>
          </div>

          <div className="support-search-wrap">
            <Search className="support-search-icon" size={18} />

            <input
              className="support-search"
              type="search"
              placeholder="Search frequently asked questions..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </header>

        {/* FAQs */}
        <section className="support-panel">
          <div className="support-panel-header">
            <div className="support-panel-title">
              <div className="support-title-icon">
                <HelpCircle size={20} />
              </div>

              <div>
                <h2>Frequently Asked Questions</h2>
                <p>Quick answers to common questions</p>
              </div>
            </div>
          </div>

          <div className="support-faq-chips">
            {["All", ...FAQ_CATEGORIES].map((cat) => (
              <button
                key={cat}
                type="button"
                className={`support-faq-chip${faqCategory === cat ? " active" : ""}`}
                onClick={() => {
                  setFaqCategory(cat);
                  setOpenFaq(null);
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {filteredFaqs.length === 0 ? (
            <div className="support-state">
              No FAQs found. Try a different search.
            </div>
          ) : (
            <div className="support-faq-list">
              {faqPage.items.map((faq, i) => {
                const index = (faqPage.page - 1) * faqPage.pageSize + i; // position in the whole list
                const isOpen = openFaq === index;

                return (
                  <div
                    className="support-faq-item"
                    key={faq.question}
                  >
                    <button
                      type="button"
                      className="support-faq-question"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setOpenFaq(isOpen ? null : index)
                      }
                    >
                      <span>{faq.question}</span>
                      {isOpen ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </button>

                    {isOpen && (
                      <div className="support-faq-answer">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
              <Pagination {...faqPage} label="FAQs" />
            </div>
          )}
        </section>

        {/* My Support Tickets */}
        <section className="support-panel">
          <div className="support-panel-header">
            <div className="support-panel-title">
              <div className="support-title-icon">
                <FileText size={20} />
              </div>

              <div>
                <h2>My Support Tickets</h2>
                <p>Track your submitted support requests</p>
              </div>
            </div>

            <button
              type="button"
              className="support-refresh-button"
              onClick={fetchTickets}
              disabled={ticketsLoading}
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          {ticketsLoading ? (
            <div className="support-state">Loading your tickets...</div>
          ) : ticketsError ? (
            <div className="support-state support-error">
              <p>{ticketsError}</p>
              <button
                type="button"
                className="support-refresh-button"
                onClick={fetchTickets}
              >
                Retry
              </button>
            </div>
          ) : tickets.length === 0 ? (
            <div className="support-state">
              <LifeBuoy size={30} />
              <p>You haven't raised any tickets yet.</p>
            </div>
          ) : (
            <div className="support-tickets">
              {ticketPage.items.map((item) => (
                <article
                  className="support-ticket-row"
                  key={item._id || item.ticketId}
                >
                  <div className="support-ticket-main">
                    <div className="support-ticket-subject">
                      <span className="support-ticket-id">
                        {item.ticketId || "Support Ticket"}
                      </span>

                      <span>{item.subject || "Untitled ticket"}</span>
                    </div>

                    <div className="support-ticket-meta">
                      {item.category || "General Support"}
                      {" · "}
                      Raised on{" "}
                      {item.createdAt &&
                      !Number.isNaN(new Date(item.createdAt).getTime())
                        ? new Date(item.createdAt).toLocaleDateString()
                        : "Date unavailable"}
                    </div>
                  </div>

                  <div className="support-ticket-badges">
                    <span
                      className={`support-badge ${getPriorityClass(
                        item.priority
                      )}`}
                    >
                      {item.priority || "Medium"}
                    </span>

                    <span
                      className={`support-badge ${getStatusClass(
                        item.status
                      )}`}
                    >
                      {item.status || "Open"}
                    </span>
                    <button
                      type="button"
                      className="support-badge"
                      style={{ cursor: "pointer", border: "1px solid #bdeff5", background: "#ecfeff", color: "#0e7490" }}
                      onClick={() => setOpenTicket(openTicket === item._id ? null : item._id)}
                    >
                      {(item.responses || []).length
                        ? `${item.responses.length} repl${item.responses.length === 1 ? "y" : "ies"}`
                        : "Details"}
                    </button>
                  </div>
                  {openTicket === item._id && (
                    <div style={{ flexBasis: "100%", width: "100%" }}>
                      <SupportTicketThread
                        ticket={item}
                        onUpdated={(updated) =>
                          setTickets((prev) => prev.map((t) => (t._id === updated._id ? { ...t, ...updated } : t)))
                        }
                      />
                    </div>
                  )}
                </article>
              ))}
              <Pagination {...ticketPage} label="tickets" />
            </div>
          )}
        </section>

        {/* Create Ticket */}
        <section className="support-panel">
          <div className="support-panel-header">
            <div className="support-panel-title">
              <div className="support-title-icon">
                <Send size={19} />
              </div>

              <div>
                <h2>Need More Help?</h2>
                <p>Tell us about your issue by creating a support ticket.</p>
              </div>
            </div>

            <button
              type="button"
              className="support-primary-button"
              onClick={() => {
                setTicketError("");
                setTicketSent(false);
                setTicketRef("");
                setShowTicket(true);
              }}
            >
              <Send size={14} />
              Create Ticket
            </button>
          </div>
        </section>
      </div>

      {/* Ticket Modal */}
      {showTicket && (
        <div
          className="support-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeTicketModal();
            }
          }}
        >
          <section
            className="support-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-modal-title"
          >
            <div className="support-modal-header">
              <div className="support-modal-heading">
                <div className="support-title-icon">
                  <LifeBuoy size={20} />
                </div>

                <h2 id="support-modal-title">Create Support Ticket</h2>
              </div>

              <button
                type="button"
                className="support-close-button"
                onClick={closeTicketModal}
                disabled={submitting}
                aria-label="Close ticket form"
              >
                <X size={18} />
              </button>
            </div>

            {ticketSent && (
              <div className="support-alert support-alert-success">
                <CheckCircle2 size={17} />
                <div>
                  Ticket created successfully.
                  {ticketRef ? ` Reference: ${ticketRef}` : ""}
                </div>
              </div>
            )}

            {ticketError && (
              <div className="support-alert support-alert-error">
                <AlertCircle size={17} />
                <div>{ticketError}</div>
              </div>
            )}

            {!ticketSent && (
              <form className="support-form" onSubmit={submitTicket}>
                <div className="support-form-group">
                  <label htmlFor="support-subject">Subject *</label>
                  <input
                    id="support-subject"
                    name="subject"
                    value={ticket.subject}
                    onChange={handleTicketChange}
                    placeholder="Briefly describe your issue"
                    maxLength={150}
                    required
                  />
                </div>

                <div className="support-form-row">
                  <div className="support-form-group">
                    <label htmlFor="support-category">Category</label>
                    <select
                      id="support-category"
                      name="category"
                      value={ticket.category}
                      onChange={handleTicketChange}
                    >
                      <option>General Support</option>
                      <option>Tasks</option>
                      <option>Task Bank</option>
                      <option>Users</option>
                      <option>Calendar</option>
                      <option>Account</option>
                      <option>Technical Issue</option>
                    </select>
                  </div>

                  <div className="support-form-group">
                    <label htmlFor="support-priority">Priority</label>
                    <select
                      id="support-priority"
                      name="priority"
                      value={ticket.priority}
                      onChange={handleTicketChange}
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="support-form-group">
                  <label htmlFor="support-message">Description *</label>
                  <textarea
                    id="support-message"
                    name="message"
                    value={ticket.message}
                    onChange={handleTicketChange}
                    placeholder="Explain the problem and what help you need..."
                    maxLength={5000}
                    required
                  />
                </div>

                <div className="support-form-footer">
                  <button
                    type="button"
                    className="support-cancel-button"
                    onClick={closeTicketModal}
                    disabled={submitting}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="support-primary-button"
                    disabled={submitting}
                  >
                    <Send size={14} />
                    {submitting ? "Submitting..." : "Submit Ticket"}
                  </button>
                </div>
              </form>
            )}

            {ticketSent && (
              <div className="support-form-footer" style={{ padding: 20 }}>
                <button
                  type="button"
                  className="support-primary-button"
                  onClick={() => {
                    setShowTicket(false);
                    setTicketSent(false);
                    setTicketRef("");
                  }}
                >
                  Done
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default Support;