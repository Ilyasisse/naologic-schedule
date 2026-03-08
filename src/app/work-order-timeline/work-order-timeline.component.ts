import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgbDatepickerModule, NgbDateStruct, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import {
  TimeScale,
  WorkCenterDocument,
  WorkOrderDocument,
  WorkOrderStatus,
} from '../timeline.models';
import { TimelineDataService } from '../timeline-data.service';

interface TimelineColumn {
  date: Date;
}

type PanelMode = 'create' | 'edit';

@Component({
  selector: 'app-work-order-timeline',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule,
    NgbDatepickerModule,
    NgbDropdownModule,
  ],
  templateUrl: './work-order-timeline.component.html',
  styleUrl: './work-order-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkOrderTimelineComponent {
  readonly timeScale = signal<TimeScale>('Month');
  readonly today = new Date();
  readonly visibleStart = signal<Date>(this.shiftDays(this.today, -14));
  readonly visibleEnd = signal<Date>(this.shiftDays(this.today, 14));

  readonly columns = computed<TimelineColumn[]>(() => {
    const cols: TimelineColumn[] = [];
    const scale = this.timeScale();
    const today = this.today;

    if (scale === 'Hour') {
      const start = new Date(today);
      start.setHours(0, 0, 0, 0);

      for (let i = 0; i < 24; i++) {
        const d = new Date(start);
        d.setHours(i);
        cols.push({ date: d });
      }
    } else if (scale === 'Day') {
      const start = this.startOfDay(this.shiftDays(today, -14));
      const end = this.startOfDay(this.shiftDays(today, 14));

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        cols.push({ date: new Date(d) });
      }
    } else if (scale === 'Week') {
      const start = this.startOfDay(this.shiftDays(today, -21));
      const end = this.startOfDay(this.shiftDays(today, 21));

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
        cols.push({ date: new Date(d) });
      }
    } else if (scale === 'Month') {
      const start = new Date(2026, 1, 1);
      const end = new Date(2026, 7, 1);

      for (
        let d = new Date(start);
        d <= end;
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      ) {
        cols.push({ date: new Date(d) });
      }
    }

    return cols;
  });

  readonly workCenters = computed<WorkCenterDocument[]>(() => this.dataService.workCenters());
  readonly workOrders = computed<WorkOrderDocument[]>(() => this.dataService.workOrders());

  readonly panelOpen = signal(false);
  readonly panelMode = signal<PanelMode>('create');
  readonly selectedWorkCenterId = signal<string | null>(null);
  readonly editingOrderId = signal<string | null>(null);
  readonly panelError = signal<string | null>(null);

  readonly form;

  readonly statusOptions: { value: WorkOrderStatus; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
    { value: 'blocked', label: 'Blocked' },
  ];

  constructor(private readonly dataService: TimelineDataService) {
    this.form = new FormBuilder().group({
      name: ['', Validators.required],
      status: ['open' as WorkOrderStatus, Validators.required],
      workCenterId: ['', Validators.required],
      startDate: [null as NgbDateStruct | null, Validators.required],
      endDate: [null as NgbDateStruct | null, Validators.required],
    });

    effect(() => {
      if (!this.panelOpen()) {
        this.form.reset({
          name: '',
          status: 'open',
          workCenterId: '',
          startDate: null,
          endDate: null,
        });
        this.selectedWorkCenterId.set(null);
        this.editingOrderId.set(null);
        this.panelError.set(null);
      }
    });
  }

  readonly pixelsPerDay = computed(() => {
    const scale = this.timeScale();

    switch (scale) {
      case 'Hour':
        return 180;
      case 'Day':
        return 250;
      case 'Week':
        return 56;
      case 'Month':
        return 64;
      default:
        return 32;
    }
  });

  onTimeScaleChange(scale: TimeScale): void {
    this.timeScale.set(scale);
  }

  onRowCellClick(center: WorkCenterDocument, date: Date): void {
    const start = date;
    const end = this.shiftDays(start, 7);
    this.openCreatePanel(center.docId, start, end);
  }

  onBarEdit(order: WorkOrderDocument): void {
    this.openEditPanel(order);
  }

  onBarDelete(order: WorkOrderDocument): void {
    this.dataService.deleteWorkOrder(order.docId);
  }

  openCreatePanel(workCenterId: string, start: Date, end: Date): void {
    this.panelMode.set('create');
    this.panelOpen.set(true);
    this.patchFormFromDates(workCenterId, start, end);
  }

  openEditPanel(order: WorkOrderDocument): void {
    this.panelMode.set('edit');
    this.panelOpen.set(true);
    this.editingOrderId.set(order.docId);

    const [start, end] = [this.parseIso(order.data.startDate), this.parseIso(order.data.endDate)];

    this.form.patchValue({
      name: order.data.name,
      status: order.data.status,
      workCenterId: order.data.workCenterId,
    });

    this.patchDateControls(start, end);
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  submitForm(): void {
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const start = this.dateStructToDate(value.startDate!);
    const end = this.dateStructToDate(value.endDate!);

    if (end < start) {
      this.panelError.set('End date must be after start date.');
      return;
    }

    const workCenterId = value.workCenterId!;
    const currentId = this.editingOrderId();
    const overlapping = this.findOverlap(workCenterId, start, end, currentId ?? undefined);

    if (overlapping) {
      this.panelError.set('This work order overlaps with an existing order in this work center.');
      return;
    }

    const iso = (d: Date) => d.toISOString().slice(0, 10);

    if (this.panelMode() === 'create') {
      const newOrder: WorkOrderDocument = {
        docId: `wo-${crypto.randomUUID()}`,
        docType: 'workOrder',
        data: {
          name: value.name!,
          status: value.status!,
          workCenterId,
          startDate: iso(start),
          endDate: iso(end),
        },
      };

      this.dataService.addWorkOrder(newOrder);
    } else {
      const existingId = currentId!;
      const existing = this.workOrders().find((o) => o.docId === existingId);

      if (!existing) {
        return;
      }

      const updated: WorkOrderDocument = {
        ...existing,
        data: {
          ...existing.data,
          name: value.name!,
          status: value.status!,
          workCenterId,
          startDate: iso(start),
          endDate: iso(end),
        },
      };

      this.dataService.updateWorkOrder(updated);
    }

    this.closePanel();
  }

  getRowOrders(centerId: string): WorkOrderDocument[] {
    return this.workOrders().filter((o) => o.data.workCenterId === centerId);
  }

  getBarStyle(order: WorkOrderDocument): Record<string, string> {
    const start = this.parseIso(order.data.startDate);
    const end = this.parseIso(order.data.endDate);

    const clampedStart = start < this.visibleStart() ? this.visibleStart() : start;
    const clampedEnd = end > this.visibleEnd() ? this.visibleEnd() : end;

    const dayOffset = this.daysBetween(this.visibleStart(), clampedStart);
    const durationDays = this.daysBetween(clampedStart, clampedEnd) + 1;
    const pxPerDay = this.pixelsPerDay();

    const left = dayOffset * pxPerDay;
    const width = Math.max(durationDays * pxPerDay - 4, 24);

    return {
      left: `${left}px`,
      width: `${width}px`,
    };
  }

  getStatusClass(status: WorkOrderStatus): string {
    return `status-pill status-${status}`;
  }

  getHeaderLabel(column: TimelineColumn): string {
    const date = column.date;
    const scale = this.timeScale();

    if (scale === 'Hour') {
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }

    if (scale === 'Day') {
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    }

    if (scale === 'Week') {
      const week = this.getWeekNumber(date);
      return `W${week}`;
    }

    if (scale === 'Month') {
      return date.toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      });
    }

    return 'unknown';
  }

  getMonthGroups(): { label: string; span: number }[] {
    const groups: { label: string; span: number }[] = [];

    for (const col of this.columns()) {
      const label = col.date.toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      });

      const lastGroup = groups[groups.length - 1];

      if (lastGroup && lastGroup.label === label) {
        lastGroup.span++;
      } else {
        groups.push({ label, span: 1 });
      }
    }

    return groups;
  }

  private shiftMonths(date: Date, delta: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + delta, 1);
  }

  isCurrentMonth(date: Date): boolean {
    const today = this.today;

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth()
    );
  }

  isToday(date: Date): boolean {
    const a = this.startOfDay(date);
    const b = this.startOfDay(this.today);
    return a.getTime() === b.getTime();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.panelOpen()) {
      this.closePanel();
    }
  }

  private patchFormFromDates(workCenterId: string, start: Date, end: Date): void {
    this.form.patchValue({
      name: '',
      status: 'open',
      workCenterId,
    });
    this.patchDateControls(start, end);
  }

  private patchDateControls(start: Date, end: Date): void {
    const toStruct = (d: Date): NgbDateStruct => ({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    });

    this.form.patchValue({
      startDate: toStruct(start),
      endDate: toStruct(end),
    });
  }

  private findOverlap(
    workCenterId: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ): WorkOrderDocument | undefined {
    const s = this.startOfDay(start);
    const e = this.startOfDay(end);

    return this.workOrders().find((o) => {
      if (o.data.workCenterId !== workCenterId) {
        return false;
      }

      if (excludeId && o.docId === excludeId) {
        return false;
      }

      const os = this.startOfDay(this.parseIso(o.data.startDate));
      const oe = this.startOfDay(this.parseIso(o.data.endDate));

      return os <= e && s <= oe;
    });
  }

  private startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private shiftDays(date: Date, delta: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + delta);
    return copy;
  }

  private parseIso(iso: string): Date {
    return this.startOfDay(new Date(iso));
  }

  private daysBetween(a: Date, b: Date): number {
    const ms = this.startOfDay(b).getTime() - this.startOfDay(a).getTime();
    return Math.round(ms / (24 * 60 * 60 * 1000));
  }

  private dateStructToDate(struct: NgbDateStruct): Date {
    return new Date(struct.year, struct.month - 1, struct.day);
  }

  private getWeekNumber(d: Date): number {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}