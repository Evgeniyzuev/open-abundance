import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTasksIcs, escapeIcsText, foldIcsLine } from "../lib/calendarExport.ts";

const now = new Date("2026-10-13T09:00:00.000Z");
const tasks = [
  { id: "t1", title: "Call the bank; ask, calmly", description: "Line one\nLine two", subtasks: ["Find the number"], completed: false, schedule: { type: "once", date: "2026-10-14" } },
  { id: "t2", title: "Report", description: "", subtasks: [], completed: false, remindAt: "2026-10-14T15:30:00.000Z", schedule: { type: "once", date: "2026-10-14" } },
  { id: "t3", title: "Walk", description: "", subtasks: [], completed: false, schedule: { type: "daily", startDate: "2026-10-13", targetDays: 21, infinite: false } },
  { id: "t4", title: "Gym", description: "", subtasks: [], completed: false, schedule: { type: "weekdays", startDate: "2026-10-13", weekdays: [1, 3, 5], infinite: true } },
  { id: "t5", title: "Done already", description: "", subtasks: [], completed: true, schedule: { type: "once", date: "2026-10-10" } },
  { id: "t6", title: "Deleted", description: "", subtasks: [], completed: false, deleted: true, schedule: { type: "once", date: "2026-10-10" } }
];
const ics = buildTasksIcs(tasks, { now, calendarName: "Open Abundance tasks" });

assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"), "valid header with CRLF");
assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
assert.equal(ics.split("BEGIN:VEVENT").length - 1, 4, "finished and deleted tasks are left out");
assert.match(ics, /UID:t1@open-abundance\.app/, "stable ids let calendars update instead of duplicating");
assert.ok(ics.includes("SUMMARY:Call the bank\\; ask\\, calmly"), "special characters are escaped");
assert.ok(ics.includes("DESCRIPTION:Line one\\nLine two\\n• Find the number"), "description and steps go into the event");
assert.match(ics, /DTSTART;VALUE=DATE:20261014\r\nDTEND;VALUE=DATE:20261015/, "one-time task without time is an all-day event");
assert.match(ics, /DTSTART:20261014T153000Z\r\nDTEND:20261014T160000Z/, "a reminder becomes a timed event");
assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY/, "with a calendar alert");
assert.match(ics, /RRULE:FREQ=DAILY;COUNT=21/, "finite daily streak keeps its length");
assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR\r\n/, "weekday schedule repeats without an end");
assert.match(ics, /DTSTAMP:20261013T090000Z/);

assert.equal(escapeIcsText("a\\b"), "a\\\\b", "backslashes are escaped");
const long = `SUMMARY:${"Очень длинное название задачи ".repeat(6)}`;
const folded = foldIcsLine(long);
assert.ok(folded.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75), "lines are folded to 75 octets, even with Cyrillic");
assert.equal(folded.replace(/\r\n /g, ""), long, "folding is lossless");

const tasksApp = readFileSync("components/TasksApp.tsx", "utf8");
assert.match(tasksApp, /buildTasksIcs\(list/);
assert.match(tasksApp, /type: "text\/calendar"/);
assert.doesNotMatch(readFileSync("lib/calendarExport.ts", "utf8"), /fetch\(|supabase/i, "export never touches the server");

console.log("Calendar export contract verified.");
