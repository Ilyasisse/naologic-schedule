import { Injectable, signal } from '@angular/core';
import { WorkCenterDocument, WorkOrderDocument, WorkOrderStatus } from './timeline.models';

@Injectable({
  providedIn: 'root',
})
export class TimelineDataService {
  readonly workCenters = signal<WorkCenterDocument[]>([
    {
      docId: 'wc-extrusion-line-a',
      docType: 'workCenter',
      data: { name: 'Extrusion Line A' },
    },
    {
      docId: 'wc-cnc-machine-1',
      docType: 'workCenter',
      data: { name: 'CNC Machine 1' },
    },
    {
      docId: 'wc-assembly-station',
      docType: 'workCenter',
      data: { name: 'Assembly Station' },
    },
    {
      docId: 'wc-quality-control',
      docType: 'workCenter',
      data: { name: 'Quality Control' },
    },
    {
      docId: 'wc-packaging-line',
      docType: 'workCenter',
      data: { name: 'Packaging Line' },
    },
  ]);

  readonly workOrders = signal<WorkOrderDocument[]>(this.createInitialWorkOrders());

  updateWorkOrder(updated: WorkOrderDocument): void {
    this.workOrders.update((orders) =>
      orders.map((o) => (o.docId === updated.docId ? updated : o)),
    );
  }

  addWorkOrder(order: WorkOrderDocument): void {
    this.workOrders.update((orders) => [...orders, order]);
  }

  deleteWorkOrder(docId: string): void {
    this.workOrders.update((orders) => orders.filter((o) => o.docId !== docId));
  }

  private createInitialWorkOrders(): WorkOrderDocument[] {
    const today = new Date();

    const iso = (date: Date) => date.toISOString().slice(0, 10);

    const shiftDays = (base: Date, delta: number): string => {
      const copy = new Date(base);
      copy.setDate(copy.getDate() + delta);
      return iso(copy);
    };

    const make = (
      id: string,
      name: string,
      workCenterId: string,
      status: WorkOrderStatus,
      startOffset: number,
      lengthDays: number,
    ): WorkOrderDocument => ({
      docId: id,
      docType: 'workOrder',
      data: {
        name,
        workCenterId,
        status,
        startDate: shiftDays(today, startOffset),
        endDate: shiftDays(today, startOffset + lengthDays - 1),
      },
    });

    return [
      make('wo-1', 'Extrusion Line B', 'wc-extrusion-line-a', 'complete', -10, 5),
      make('wo-2', 'Extrusion Line C', 'wc-extrusion-line-a', 'in-progress', -1, 5),
      make('wo-3', 'Extrusion Line A', 'wc-extrusion-line-a', 'open', -14, 3),
      make('wo-4', 'wc-cnc-machine-1', 'wc-cnc-machine-1', 'blocked', -5, 4),
      make('wo-5', 'wc-cnc-machine-1', 'wc-cnc-machine-1', 'complete', -10, 4),
      make('wo-6', 'Quality Control-2', 'wc-quality-control', 'in-progress', -5, 4),
      make('wo-6', 'Quality Control-1', 'wc-quality-control', 'complete', -11, 4),
      make('wo-7', 'Assembly Station', 'wc-assembly-station', 'in-progress', -5, 4),
      make('wo-8', 'Assembly Station', 'wc-assembly-statio', 'in-progress', -5, 4),
      make('wo-9', 'Packaging Line', 'wc-packaging-line', 'blocked', -5, 3),
      make('wo-10', 'Packaging Line', 'wc-packaging-line', 'complete', -13, 5),
    ];
  }
}
