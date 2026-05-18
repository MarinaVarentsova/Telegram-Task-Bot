/**
 * Portal-free modal overlay — avoids Radix Dialog portal crashes.
 * Renders as a fixed overlay div directly in the component tree.
 */
import { Component, type ReactNode, useState, useEffect } from "react";
import { Task, Column, Category } from "@/lib/types";
import { useUpdateTask, useDeleteTask } from "@/hooks/use-kanban";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// ─── Error boundary (catches any crash inside the modal) ──────────────────────
class ModalErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { error: string | null }
> {
  constructor(props: { children: ReactNode; onClose: () => void }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.error) {
      return (
        <Overlay onBackdropClick={this.props.onClose}>
          <div className="bg-card rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-destructive mb-2">Ошибка модального окна</h2>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap mb-4">{this.state.error}</pre>
            <Button onClick={this.props.onClose}>Закрыть</Button>
          </div>
        </Overlay>
      );
    }
    return this.props.children;
  }
}

// ─── Simple overlay backdrop ──────────────────────────────────────────────────
function Overlay({ children, onBackdropClick }: { children: ReactNode; onBackdropClick: () => void }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onBackdropClick(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onBackdropClick]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onBackdropClick(); }}
    >
      {children}
    </div>
  );
}

// ─── Safe date helper ─────────────────────────────────────────────────────────
function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  try { return new Date(value).toISOString().split("T")[0]; } catch { return ""; }
}

// ─── Modal content ────────────────────────────────────────────────────────────
interface TaskModalProps {
  task: Task;
  columns: Column[];
  categories: Category[];
  onClose: () => void;
}

function TaskModalInner({ task, columns, categories, onClose }: TaskModalProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [title, setTitle] = useState(String(task.title ?? ""));
  const [description, setDescription] = useState(String(task.description ?? ""));
  const [categoryId, setCategoryId] = useState(String(task.category_id ?? ""));
  const [columnId, setColumnId] = useState(String(task.board_column_id ?? ""));
  const [deadline, setDeadline] = useState(toDateInput(task.deadline));

  useEffect(() => {
    setTitle(String(task.title ?? ""));
    setDescription(String(task.description ?? ""));
    setCategoryId(String(task.category_id ?? ""));
    setColumnId(String(task.board_column_id ?? ""));
    setDeadline(toDateInput(task.deadline));
  }, [task.id]);

  const handleSave = () => {
    updateTask.mutate(
      {
        id: task.id,
        title: (title || "").trim() || undefined,
        description: description || undefined,
        category_id: categoryId || null,
        board_column_id: columnId || undefined,
        deadline: deadline ? new Date(deadline).toISOString() : null,
      },
      { onSuccess: onClose },
    );
  };

  const handleDelete = () => {
    if (confirm("Вы уверены, что хотите удалить эту задачу?")) {
      deleteTask.mutate(task.id, { onSuccess: onClose });
    }
  };

  return (
    <Overlay onBackdropClick={onClose}>
      <div
        className="bg-card rounded-lg shadow-xl w-full max-w-[500px] mx-4 flex flex-col max-h-[90vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h2 className="text-lg font-semibold text-foreground">Редактировать задачу</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="grid gap-4 px-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="modal-title">Название</Label>
            <Input
              id="modal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="modal-description">Описание</Label>
            <Textarea
              id="modal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="modal-category">Категория</Label>
              <select
                id="modal-category"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Без категории</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="modal-column">Колонка</Label>
              <select
                id="modal-column"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
              >
                <option value="">—</option>
                {(columns ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="modal-deadline">Дедлайн</Label>
            <Input
              id="modal-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-6 pt-2 border-t mt-2">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteTask.isPending}
          >
            Удалить
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Закрыть
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateTask.isPending || !(title || "").trim()}
            >
              Сохранить
            </Button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────
export function TaskModal(props: TaskModalProps) {
  return (
    <ModalErrorBoundary onClose={props.onClose}>
      <TaskModalInner {...props} />
    </ModalErrorBoundary>
  );
}
