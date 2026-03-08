import { Component } from '@angular/core';
import { WorkOrderTimelineComponent } from './work-order-timeline/work-order-timeline.component';

@Component({
  selector: 'app-root',
  imports: [WorkOrderTimelineComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
}
