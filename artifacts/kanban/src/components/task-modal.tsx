import { Component, type ReactNode, useState, useEffect } from "react";
import { Task, Column, Category } from "@/lib/types";
import { useUpdateTask, useDeleteTask } from "@/hooks/use-kanban";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// ─── Error boundary ───────────────────────────────────────────────────────────
class ModalErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <Dialog open={true} onOpenChange={() => this.props.onClose()}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Ошибка</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-4">
              Не удалось открыть задачу: {this.state.message}
            </p>
            <DialogFooter>
              <Button onClick={this.props.onClose}>Закрыть</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
    return this.props.children;
  }
}

// ─── Modal body ───────────────────────────────────────────────────────────────
interface TaskModalProps {
  task: Task;
  columns: Column[];
  categories: Category[];
  onClose: () => void;
}

function safeDate(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return new Date(value).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function TaskModalInner({ task, columns, categories, onClose }: TaskModalProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [title, setTitle] = useState(String(task.title ?? ""));
  const [description, setDescription] = useState(String(task.description ?? ""));
  const [categoryId, setCategoryId] = useState(String(task.category_id ?? ""));
  const [columnId, setColumnId] = useState(String(task.board_column_id ?? ""));
  const [deadline, setDeadline] = useState(safeDate(task.deadline));

  useEffect(() => {
    setTitle(String(task.title ?? ""));
    setDescription(String(task.description ?? ""));
    setCategoryId(String(task.category_id ?? ""));
    setColumnId(String(task.board_column_id ?? ""));
    setDeadline(safeDate(task.deadline));
  }, [task.id]);

  const handleSave = () => {
    updateTask.mutate(
      {
        id: task.id,
        title: title || undefined,
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
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Редактировать задачу</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Название</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="category">Категория</Label>
              <select
                id="category"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Без категории</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="column">Колонка</Label>
              <select
                id="column"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
              >
                <option value="">—</option>
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="deadline">Дедлайн</Label>
            <Input
              id="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="destructive" onClick={handleDelete} disabled={deleteTask.isPending}>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Public export (wrapped in boundary) ─────────────────────────────────────
export function TaskModal(props: TaskModalProps) {
  return (
    <ModalErrorBoundary onClose={props.onClose}>
      <TaskModalInner {...props} />
    </ModalErrorBoundary>
  );
}
