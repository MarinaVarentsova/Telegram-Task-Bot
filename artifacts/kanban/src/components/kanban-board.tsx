import { useState } from "react";
import { useBoardData, useUpdateTask } from "@/hooks/use-kanban";
import { TaskModal } from "@/components/task-modal";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Task } from "@/lib/types";

// ── Category color palette ────────────────────────────────────────────────────
// Keyed by lowercase substring of the category name.
// Each entry: badge bg, badge text, card left-border, card tint bg.

interface CategoryStyle {
  badgeBg: string;
  badgeText: string;
  border: string;
  cardTint: string;
}

const CATEGORY_PALETTE: Array<[string, CategoryStyle]> = [
  ["ии",       { badgeBg: "#ede9f8", badgeText: "#6b52c8", border: "#b8a9e8", cardTint: "#faf8fe" }],
  ["ai",       { badgeBg: "#ede9f8", badgeText: "#6b52c8", border: "#b8a9e8", cardTint: "#faf8fe" }],
  ["институт", { badgeBg: "#ddeeff", badgeText: "#2155a0", border: "#93bdf5", cardTint: "#f5f9ff" }],
  ["обучение", { badgeBg: "#ddeeff", badgeText: "#2155a0", border: "#93bdf5", cardTint: "#f5f9ff" }],
  ["здоровье", { badgeBg: "#dcf5e7", badgeText: "#1c7a48", border: "#82d9a8", cardTint: "#f4fcf7" }],
  ["спорт",    { badgeBg: "#d6f2ef", badgeText: "#0e756d", border: "#60d0c6", cardTint: "#f2fdfc" }],
  ["дом",      { badgeBg: "#fdecd6", badgeText: "#8f4a10", border: "#f0a86a", cardTint: "#fff9f3" }],
  ["клиника",  { badgeBg: "#fde2e6", badgeText: "#b82a3d", border: "#f09aaa", cardTint: "#fff4f5" }],
  ["лука",     { badgeBg: "#fef0d4", badgeText: "#8a4a0a", border: "#f5c46a", cardTint: "#fffcf3" }],
  ["прочее",   { badgeBg: "#edf0f5", badgeText: "#54657a", border: "#b8c5d6", cardTint: "#f8f9fb" }],
];

const FALLBACK_PALETTE: CategoryStyle[] = [
  { badgeBg: "#e6ecf8", badgeText: "#3a4d8a", border: "#9ab0d8", cardTint: "#f5f7fc" },
  { badgeBg: "#f0e6f8", badgeText: "#6a3d8a", border: "#c0a0d8", cardTint: "#fbf7fe" },
  { badgeBg: "#e6f5e8", badgeText: "#2a6a3a", border: "#80c890", cardTint: "#f5fdf6" },
  { badgeBg: "#f8f0e6", badgeText: "#8a4a2a", border: "#d4a070", cardTint: "#fdfaf5" },
  { badgeBg: "#e6f5f5", badgeText: "#1a6a6a", border: "#70c8c8", cardTint: "#f3fdfd" },
];

function getCategoryStyle(name: string): CategoryStyle {
  const lower = name.toLowerCase();
  for (const [key, style] of CATEGORY_PALETTE) {
    if (lower.includes(key)) return style;
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

// ── Column color palette ──────────────────────────────────────────────────────

interface ColumnStyle {
  colBg: string;
  headerBg: string;
  accent: string;
}

const COLUMN_PALETTE: Array<[string, ColumnStyle]> = [
  ["бэклог",    { colBg: "#f4f6f9", headerBg: "#e8ecf3", accent: "#7b92b4" }],
  ["на неделе", { colBg: "#f2f7ff", headerBg: "#e0edfb", accent: "#4e82d0" }],
  ["сегодня",   { colBg: "#fffaf2", headerBg: "#fef0d4", accent: "#d48030" }],
  ["выполнено", { colBg: "#f2fdf6", headerBg: "#dcf5e7", accent: "#3aaa6a" }],
  ["во вне",    { colBg: "#f7f3fd", headerBg: "#ede5f8", accent: "#9468cc" }],
  ["тест",      { colBg: "#f2fcfd", headerBg: "#d8f2f4", accent: "#38b0ba" }],
];

function getColumnStyle(name: string): ColumnStyle {
  const lower = name.toLowerCase();
  for (const [key, style] of COLUMN_PALETTE) {
    if (lower.includes(key)) return style;
  }
  return { colBg: "#f4f6f9", headerBg: "#e8ecf3", accent: "#8a9ab0" };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function KanbanBoard() {
  const { columns, categories, tasks, hasTgId, isLoading, error } = useBoardData();
  const updateTask = useUpdateTask();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // No tg_id in URL — user must open the board from the Telegram bot
  if (!hasTgId) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#f0f3f8" }}>
        <div
          className="rounded-2xl px-8 py-10 text-center shadow-sm"
          style={{ background: "#ffffff", maxWidth: 360, border: "1px solid #dde3ed" }}
        >
          <div className="mb-3 text-3xl">🤖</div>
          <p className="text-base font-medium" style={{ color: "#1e2a3a" }}>
            Откройте доску из Telegram-бота
          </p>
          <p className="mt-2 text-sm" style={{ color: "#6b7a8d" }}>
            Нажмите кнопку «Просмотреть бэклог» в боте, чтобы увидеть свои задачи.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground animate-pulse">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-destructive">Ошибка загрузки данных</div>
      </div>
    );
  }

  const filteredTasks = tasks.filter((task) => {
    if (selectedCategory && task.category_id !== selectedCategory) return false;
    if (selectedColumn && task.board_column_id !== selectedColumn) return false;
    return true;
  });

  const columnsToDisplay = selectedColumn
    ? columns.filter((c) => c.id === selectedColumn)
    : columns;

  const grouped: Record<string, Task[]> = {};
  for (const col of columns) grouped[col.id] = [];
  for (const task of filteredTasks) {
    if (task.board_column_id && grouped[task.board_column_id]) {
      grouped[task.board_column_id].push(task);
    }
  }

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("taskId", taskId);
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) updateTask.mutate({ id: taskId, board_column_id: columnId });
  };
  const handleCardClick = (task: Task) => {
    console.log("[kanban] selected task:", task);
    setSelectedTask(task);
  };

  return (
    <div className="flex h-screen flex-col" style={{ background: "#f0f3f8" }}>
      {/* ── Header ── */}
      <header
        className="border-b px-6 py-3 flex items-center justify-between shadow-sm"
        style={{ background: "#ffffff", borderColor: "#dde3ed" }}
      >
        <h1 className="text-lg font-semibold tracking-tight" style={{ color: "#1e2a3a" }}>
          Задачи
        </h1>
        <div className="flex items-center gap-3">
          <select
            className="h-8 rounded-md border px-3 text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: "#cdd6e4", background: "#f8fafc", color: "#3a4d5e", ringColor: "#93bdf5" }}
            value={selectedCategory || ""}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
          >
            <option value="">Категория (Все)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            className="h-8 rounded-md border px-3 text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: "#cdd6e4", background: "#f8fafc", color: "#3a4d5e" }}
            value={selectedColumn || ""}
            onChange={(e) => setSelectedColumn(e.target.value || null)}
          >
            <option value="">Колонка (Все)</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button
            onClick={() => { setSelectedCategory(null); setSelectedColumn(null); }}
            className="h-8 px-4 text-sm font-medium rounded-md transition-colors hover:bg-slate-100"
            style={{ color: "#6b7f96" }}
          >
            Сбросить
          </button>
        </div>
      </header>

      {/* ── Board ── */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden p-5">
        <div className="flex h-full items-start gap-5">
          {columnsToDisplay.map((column) => {
            const columnTasks = grouped[column.id] ?? [];
            const colStyle = getColumnStyle(column.name);

            return (
              <div
                key={column.id}
                className="flex h-full w-72 flex-shrink-0 flex-col rounded-xl shadow-sm"
                style={{
                  background: colStyle.colBg,
                  border: "1px solid rgba(0,0,0,0.07)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
                }}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {/* Column header */}
                <div
                  className="flex-shrink-0 flex items-center justify-between rounded-t-xl px-4 py-3"
                  style={{
                    background: colStyle.headerBg,
                    borderBottom: `2px solid ${colStyle.accent}22`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: colStyle.accent }}
                    />
                    <h3
                      className="text-sm font-semibold tracking-wide"
                      style={{ color: "#1e2a3a" }}
                    >
                      {column.name}
                    </h3>
                  </div>
                  <span
                    className="text-xs font-semibold rounded-full px-2 py-0.5"
                    style={{
                      background: `${colStyle.accent}22`,
                      color: colStyle.accent,
                    }}
                  >
                    {columnTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto space-y-2.5 p-3 pb-4">
                  {columnTasks.length === 0 ? (
                    <div
                      className="text-xs text-center py-10"
                      style={{ color: "#9aaabb" }}
                    >
                      Нет задач
                    </div>
                  ) : (
                    columnTasks.map((task) => {
                      const category = categories.find((c) => c.id === task.category_id);
                      const catStyle = category ? getCategoryStyle(category.name) : null;

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onClick={() => handleCardClick(task)}
                          className="relative cursor-pointer rounded-lg transition-all"
                          style={{
                            background: catStyle ? catStyle.cardTint : "#ffffff",
                            border: "1px solid rgba(0,0,0,0.08)",
                            borderLeft: catStyle ? `3px solid ${catStyle.border}` : "3px solid #d0d8e4",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                            padding: "10px 12px 10px 10px",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLDivElement).style.boxShadow = "0 3px 8px rgba(0,0,0,0.10)";
                            (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                            (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                          }}
                        >
                          {/* Category badge */}
                          {catStyle && category && (
                            <span
                              className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium mb-2"
                              style={{
                                background: catStyle.badgeBg,
                                color: catStyle.badgeText,
                              }}
                            >
                              {category.name}
                            </span>
                          )}

                          {/* Title */}
                          <h4
                            className="text-sm font-semibold leading-snug"
                            style={{ color: "#1e2a3a" }}
                          >
                            {task.title || "Без названия"}
                          </h4>

                          {/* Description */}
                          {task.description && (
                            <p
                              className="mt-1 text-xs leading-relaxed line-clamp-2"
                              style={{ color: "#6b7f96" }}
                            >
                              {task.description}
                            </p>
                          )}

                          {/* Deadline */}
                          {task.deadline && (
                            <div
                              className="mt-2.5 flex items-center gap-1.5 text-xs"
                              style={{ color: "#9aaabb" }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                              </svg>
                              {(() => {
                                try {
                                  return format(new Date(task.deadline), "d MMM yyyy", { locale: ru });
                                } catch {
                                  return task.deadline;
                                }
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          columns={columns}
          categories={categories}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
