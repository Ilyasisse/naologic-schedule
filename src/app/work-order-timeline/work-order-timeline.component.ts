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
  // Stores the current zoom level of the timeline.
  // Example: if timeScale is 'day', the header shows days.
  // Needed? Yes, this is important for switching between day/week/month view.
  readonly timeScale = signal<TimeScale>('Month');

  // Stores today's real date.
  // Example: used to highlight the current day in the timeline.
  // Needed? Yes, useful for current-day indicator.
  readonly today = new Date();

  // The visible start date of the timeline.
  // Starts 14 days before today.
  // Example: if today is March 10, visibleStart becomes Feb 24.
  // Needed? Yes, needed to know what date range is shown.
  readonly visibleStart = signal<Date>(this.shiftDays(this.today, -14));

  // The visible end date of the timeline.
  // Starts 14 days after today.
  // Example: if today is March 10, visibleEnd becomes March 24.
  // Needed? Yes, needed to know the visible date range.
  readonly visibleEnd = signal<Date>(this.shiftDays(this.today, 14));

  // Builds the array of timeline columns between visibleStart and visibleEnd.
  // Each column represents one day.
  // Example: if start = March 1 and end = March 3, columns = [Mar 1, Mar 2, Mar 3].
  // Needed? Yes, this is how the timeline header/grid knows what dates to render.
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
    const start = new Date(2026, 1, 1); // Feb 1, 2026
    const end = new Date(2026, 7, 1);   // Aug 1, 2026

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

  // Gets work centers from the data service.
  // Example: returns things like "CNC Machine 1", "Packaging Line".
  // Needed? Yes, because rows depend on work centers.
  readonly workCenters = computed<WorkCenterDocument[]>(() => this.dataService.workCenters());

  // Gets work orders from the data service.
  // Example: returns all scheduled jobs shown as bars on the timeline.
  // Needed? Yes, this is core data for the component.
  readonly workOrders = computed<WorkOrderDocument[]>(() => this.dataService.workOrders());

  // Controls whether the create/edit side panel is open.
  // Example: true = panel visible, false = panel hidden.
  // Needed? Yes.
  readonly panelOpen = signal(false);

  // Stores whether panel is in create mode or edit mode.
  // Example: 'create' when making a new order, 'edit' when updating one.
  // Needed? Yes.
  readonly panelMode = signal<PanelMode>('create');

  // Stores selected work center id when creating an order.
  // Example: "wc-1"
  // Needed? Maybe not strictly needed in current code, because form also stores workCenterId.
  // This one looks optional unless you use it in the template.
  readonly selectedWorkCenterId = signal<string | null>(null);

  // Stores which order is being edited.
  // Example: "wo-123"
  // Needed? Yes, needed so edit mode knows which order to update.
  readonly editingOrderId = signal<string | null>(null);

  // Stores error text shown in the panel.
  // Example: "This work order overlaps..."
  // Needed? Yes, helpful for validation feedback.

  /** CHECK THIS ONE NEED TO SHOW ON UI*/
  readonly panelError = signal<string | null>(null);

  // Reactive form used for create/edit panel.
  // Example: holds name, status, workCenterId, startDate, endDate.
  // Needed? Yes, this is core to the form behavior.
  readonly form;

  // Options for the status dropdown.
  // Example: dropdown shows Open, In Progress, Complete, Blocked.
  // Needed? Yes, useful for ng-select.
  readonly statusOptions: { value: WorkOrderStatus; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
    { value: 'blocked', label: 'Blocked' },
  ];

  // Constructor runs when the component is created.
  // It builds the reactive form and sets up an effect to reset the form whenever the panel closes.
  //
  // Example:
  // - open panel, type data
  // - close panel
  // - form resets back to empty/default values
  //
  // Needed? Yes.
  // The form creation is required.
  // The effect is also useful so stale data does not remain.

  /** CHECK THIS ONE NEED TO SHOW ON UI*/
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

  // Decides how many pixels each day should take depending on zoom level.
  //
  // Example:
  // - day view = 58 px per day
  // - week view = 56 px per day
  // - month view = 64 px per day
  //
  // Needed? Yes, needed for bar width/position calculations.
  // Note: the naming is a little misleading because even in week/month it still returns a daily pixel value.
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

  // Changes the timeline zoom level.
  //
  // Example:
  // onTimeScaleChange('day') → timeline switches to day mode
  //
  // Needed? Yes.
  onTimeScaleChange(scale: TimeScale): void {
    this.timeScale.set(scale);
  }

  // Called when user clicks an empty cell in a row.
  // It creates default start and end dates, then opens the create panel.
  //
  // Example:
  // user clicks March 10 in CNC Machine row
  // start = March 10
  // end = March 17
  // create panel opens prefilled
  //
  // Needed? Yes, core feature.
  onRowCellClick(center: WorkCenterDocument, date: Date): void {
    const start = date;
    const end = this.shiftDays(start, 7);
    this.openCreatePanel(center.docId, start, end);
  }

  // Called when user clicks Edit on a work order bar.
  // It opens the edit panel with that order's current data.
  //
  // Example:
  // click edit on "Order A" → panel opens with Order A values
  //
  // Needed? Yes.
  onBarEdit(order: WorkOrderDocument): void {
    this.openEditPanel(order);
  }

  // Called when user clicks Delete on a work order bar.
  // It removes the order from the data service.
  //
  // Example:
  // click delete on "Order B" → order disappears from timeline
  //
  // Needed? Yes, unless delete is not required.
  onBarDelete(order: WorkOrderDocument): void {
    this.dataService.deleteWorkOrder(order.docId);
  }

  // Opens the panel in create mode and fills the form with initial values.
  //
  // Example:
  // workCenterId = "wc-1", start = March 10, end = March 17
  // panel opens ready for new order creation
  //
  // Needed? Yes.
  openCreatePanel(workCenterId: string, start: Date, end: Date): void {
    this.panelMode.set('create');
    this.panelOpen.set(true);
    this.patchFormFromDates(workCenterId, start, end);
  }

  // Opens the panel in edit mode and fills the form with an existing order's values.
  //
  // Example:
  // edit existing Order A → name, status, dates all appear in form
  //
  // Needed? Yes.
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

  // Closes the side panel.
  //
  // Example:
  // user clicks cancel → panelOpen becomes false
  //
  // Needed? Yes.
  closePanel(): void {
    this.panelOpen.set(false);
  }

  // Main form submission logic.
  // This is the heart of create/edit behavior.
  //
  // What it does:
  // 1. marks form touched
  // 2. stops if form invalid
  // 3. converts date structs into real Date objects
  // 4. checks end date is after start date
  // 5. checks overlap with existing orders
  // 6. creates a new order or updates an existing one
  // 7. closes the panel
  //
  // Example:
  // user enters "Order X", March 10 to March 15, no overlap
  // → order gets added or updated
  //
  // Needed? Yes, absolutely.
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

  // Returns all work orders that belong to a specific work center row.
  //
  // Example:
  // getRowOrders("wc-1") → returns only orders for CNC Machine 1
  //
  // Needed? Yes, useful for rendering each row's bars.
  getRowOrders(centerId: string): WorkOrderDocument[] {
    return this.workOrders().filter((o) => o.data.workCenterId === centerId);
  }

  // Calculates the inline CSS style for a work order bar.
  // This determines where the bar starts and how wide it is.
  //
  // Example:
  // if order starts 3 days after visibleStart and pxPerDay = 50,
  // left = 150px
  // if duration = 4 days,
  // width = 200px (minus small adjustment)
  //
  // Needed? Yes, this is one of the most important functions in the timeline.
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

  // Returns the CSS class string for a status pill.
  //
  // Example:
  // getStatusClass('open') → "status-pill status-open"
  //
  // Needed? Yes, useful for styling.
  // Could be removed only if you hardcode classes in template another way.
  getStatusClass(status: WorkOrderStatus): string {
    return `status-pill status-${status}`;
  }

  // Returns the label shown in the timeline header for each column.
  //
  // Example:
  // day mode → "Mar 6"
  // week mode → "W10"
  // month mode → "Mar 26"
  //
  // Needed? Yes, needed for header display.
  getHeaderLabel(column: TimelineColumn): string {
  const date = column.date;
  const scale = this.timeScale();

  if (scale === 'Hour') {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  if (scale === 'Day') {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  }

  if (scale === 'Week') {
    const week = this.getWeekNumber(date);
    return `W${week}`;
  }

  if (scale === 'Month') {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric'
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

  // Checks whether a given date is today.
  //
  // Example:
  // isToday(new Date()) → true
  // isToday(new Date('2026-03-01')) → false
  //
  // Needed? Yes, useful for current-day highlight.
  isToday(date: Date): boolean {
    const a = this.startOfDay(date);
    const b = this.startOfDay(this.today);
    return a.getTime() === b.getTime();
  }

  // Listens for Escape key press on the whole document.
  // If panel is open, pressing Escape closes it.
  //
  // Example:
  // panel open + user presses Esc → closePanel()
  //
  // Needed? Not required, but very good UX.
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.panelOpen()) {
      this.closePanel();
    }
  }

  // Fills the form with default values for creating a new order.
  //
  // Example:
  // workCenterId = "wc-1", start = March 10, end = March 17
  // form becomes:
  // name = ""
  // status = "open"
  // workCenterId = "wc-1"
  // dates filled in
  //
  // Needed? Yes, helpful small helper method.
  private patchFormFromDates(workCenterId: string, start: Date, end: Date): void {
    this.form.patchValue({
      name: '',
      status: 'open',
      workCenterId,
    });
    this.patchDateControls(start, end);
  }

  // Converts normal JavaScript Date objects into NgbDateStruct
  // and patches them into the form.
  //
  // Example:
  // March 6, 2026 becomes:
  // { year: 2026, month: 3, day: 6 }
  //
  // Needed? Yes, because ng-bootstrap datepicker uses NgbDateStruct, not Date.
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

  // Checks whether a new or edited work order overlaps with any existing order
  // in the same work center.
  //
  // Logic:
  // overlap exists when:
  // existingStart <= newEnd AND newStart <= existingEnd
  //
  // Example:
  // existing order: Mar 10 - Mar 15
  // new order: Mar 14 - Mar 18
  // overlap = true
  //
  // Needed? Yes, this is one of the key business rules.
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

  // Removes the time part from a date so comparison is day-only.
  //
  // Example:
  // March 6 2026 15:20 becomes March 6 2026 00:00
  //
  // Needed? Yes, extremely useful for accurate day-based comparisons.
  private startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // Adds or subtracts days from a date.
  //
  // Example:
  // shiftDays(March 10, 7) → March 17
  // shiftDays(March 10, -14) → Feb 24
  //
  // Needed? Yes, useful helper.
  private shiftDays(date: Date, delta: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + delta);
    return copy;
  }

  // Converts an ISO date string into a Date object and normalizes it to start of day.
  //
  // Example:
  // "2026-03-06" → Date for March 6, 2026 at 00:00
  //
  // Needed? Yes, useful because work order dates are stored as ISO strings.
  private parseIso(iso: string): Date {
    return this.startOfDay(new Date(iso));
  }

  // Returns number of days between two dates.
  //
  // Example:
  // daysBetween(March 1, March 4) → 3
  //
  // Needed? Yes, very important for bar positioning and duration.
  private daysBetween(a: Date, b: Date): number {
    const ms = this.startOfDay(b).getTime() - this.startOfDay(a).getTime();
    return Math.round(ms / (24 * 60 * 60 * 1000));
  }

  // Converts NgbDateStruct from the datepicker into a normal JavaScript Date.
  //
  // Example:
  // { year: 2026, month: 3, day: 6 } → new Date(2026, 2, 6)
  //
  // Needed? Yes, required because your form uses ng-bootstrap date structs.
  private dateStructToDate(struct: NgbDateStruct): Date {
    return new Date(struct.year, struct.month - 1, struct.day);
  }

  // Calculates ISO-like week number for a date.
  //
  // Example:
  // a date in early March might return week 10
  //
  // Needed? Only needed if you truly support week labels like W10, W11, etc.
  // If week mode is removed, this can also be removed.
  private getWeekNumber(d: Date): number {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}
