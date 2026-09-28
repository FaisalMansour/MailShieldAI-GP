import { useState } from "react";
import { Search, SlidersHorizontal, Inbox } from "lucide-react";
import type { Email } from "@/lib/types";
import { filterEmails, type Filters } from "@/lib/state";
import { EmailTable } from "./ui";
const defaults: Filters = {
  search: "",
  severity: "All",
  category: "All",
  status: "All",
  sort: "newest",
};
export function EmailList({ emails }: { emails: Email[] }) {
  const [filters, setFilters] = useState(defaults);
  const shown = filterEmails(emails, filters);
  const categories = [
    ...new Set(emails.flatMap((e) => e.report?.categories ?? [])),
  ].sort();
  function update(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DEMO INBOX</p>
          <h1>All emails</h1>
          <p>Review the evidence, one message at a time.</p>
        </div>
        <span className="date-range">{emails.length} fictional messages</span>
      </div>
      <section className="panel">
        <div className="filter-bar">
          <label className="search-field">
            <Search size={18} />
            <span className="sr-only">Search sender or subject</span>
            <input
              type="search"
              placeholder="Search sender or subject…"
              value={filters.search}
              onChange={(e) => update("search", e.target.value)}
            />
          </label>
          <div className="filter-fields">
            <SlidersHorizontal size={17} />
            <label>
              Severity
              <select
                value={filters.severity}
                onChange={(e) => update("severity", e.target.value)}
              >
                <option value="All">All severities</option>
                {["High", "Medium", "Low"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Threat category
              <select
                value={filters.category}
                onChange={(e) => update("category", e.target.value)}
              >
                <option value="All">All categories</option>
                {categories.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Analysis status
              <select
                value={filters.status}
                onChange={(e) => update("status", e.target.value)}
              >
                <option value="All">All statuses</option>
                {["Analyzed", "Processing", "Pending", "Analysis failed"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Sort by
              <select
                value={filters.sort}
                onChange={(e) => update("sort", e.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="risk">Highest risk first</option>
              </select>
            </label>
          </div>
          <div className="results-line">
            <span role="status">
              Showing {shown.length} of {emails.length} emails
            </span>
            <button className="text-link" onClick={() => setFilters(defaults)}>
              Clear filters
            </button>
          </div>
        </div>
        {shown.length ? (
          <EmailTable emails={shown} />
        ) : (
          <div className="empty-state">
            <Inbox size={36} />
            <h2>No matching emails</h2>
            <p>Try another sender, subject, or filter combination.</p>
            <button className="button" onClick={() => setFilters(defaults)}>
              Clear all filters
            </button>
          </div>
        )}
      </section>
    </>
  );
}
