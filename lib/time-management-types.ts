/** Row from `public.timesheets`. */
export type TimesheetRow = {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  job_id: string | null;
  job_name: string | null;
  log_date: string;
  check_in: string | null;
  check_out: string | null;
  hours_worked: string | number | null;
  overtime_hours: string | number | null;
  entry_type: string;
  daily_log_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

/** Row from `public.time_off_requests`. */
export type TimeOffRequestRow = {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  start_date: string;
  end_date: string;
  request_type: string;
  notes: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
};

/** Row from `public.work_calendar`. */
export type WorkCalendarRow = {
  id: string;
  calendar_date: string;
  employee_id: string | null;
  employee_name: string | null;
  event_type: string;
  job_id: string | null;
  job_name: string | null;
  check_in: string | null;
  check_out: string | null;
  hours: string | number | null;
  notes: string | null;
  source: string;
  reference_id: string | null;
  created_at: string;
};
