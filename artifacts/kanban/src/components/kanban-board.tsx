import { useState } from "react";
import { useBoardData, useUpdateTask } from "@/hooks/use-kanban";
import { TaskModal } from "@/components/task-modal";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Task } from "@/lib/types";

export function KanbanBoard() {
  const { columns, categories, tasks, isLoading, error } = useBoardData();
  const updateTask = useUpdateTask();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      updateTask.mutate({ id: taskId, board_column_id: columnId });
    }
  };

  const handleCardClick = (task: Task) => {
    console.log("[kanban] selected task:", task);
    setSelectedTask(task);
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="border-b bg-card px-6 py-4 flex items-center justify-between shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Задачи</h1>
        <div className="flex items-center gap-3">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring"
            value={selectedCategory || ""}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
          >
            <option value="">Категория (Все)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring"
            value={selectedColumn || ""}
            onChange={(e) => setSelectedColumn(e.target.value || null)}
          >
            <option value="">Колонка (Все)</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setSelectedCategory(null);
              setSelectedColumn(null);
            }}
            className="h-9 px-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Сбросить
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <div className="flex h-full items-start gap-6">
          {columnsToDisplay.map((column) => {
            const columnTasks = grouped[column.id] ?? [];

            return (
              <div
                key={column.id}
                className="flex h-full w-80 flex-shrink-0 flex-col rounded-lg bg-secondary/50 p-3"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="font-medium text-sm text-foreground">
                    {column.name}
                  </h3>
                  <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    {columnTasks.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pb-2">
                  {columnTasks.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-8">
                      Нет задач
                    </div>
                  ) : (
                    columnTasks.map((task) => {
                      const category = categories.find(
                        (c) => c.id === task.category_id
                      );
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onClick={() => handleCardClick(task)}
                          className="group relative cursor-pointer rounded-md border bg-card p-3 shadow-sm hover:shadow transition-all hover:border-primary/30"
                        >
                          <div className="mb-2">
                            {category && (
                              <span className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                {category.name}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-medium text-card-foreground leading-snug">
                            {task.title || "Без названия"}
                          </h4>
                          {task.description && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                              {task.description}
                            </p>
                          )}
                          {task.deadline && (
                            <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
