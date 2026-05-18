import {
  confirmAssignment,
  createAttendanceRecord,
  createDepartment,
  createEmployee,
  createLeaveRequest,
  createPayrollRecord,
  createPerformanceReview,
  createPosition,
  createRecruitmentCandidate,
  createRecruitmentJob,
  deleteAttendanceRecord,
  deleteDepartment,
  deleteEmployee,
  deleteLeaveRequest,
  deletePayrollRecord,
  deletePerformanceReview,
  deletePosition,
  deleteRecruitmentCandidate,
  deleteRecruitmentJob,
  ensureHrSchema,
  getAttendanceRecord,
  getAssignmentAdviceAvailability,
  getDepartment,
  getEmployee,
  getLeaveRequest,
  getPayrollRecord,
  getPerformanceReview,
  getPosition,
  getAssignmentAdvice,
  getResourceSnapshot,
  getRecruitmentCandidate,
  getRecruitmentJob,
  getWorkloadSnapshot,
  listAttendanceRecords,
  listDepartments,
  listEmployees,
  listLeaveRequests,
  listPayrollRecords,
  listPerformanceReviews,
  listPositions,
  listRecruitmentCandidates,
  listRecruitmentJobs,
  previewAssignment,
  updateAttendanceRecord,
  updateDepartment,
  updateEmployee,
  updateLeaveRequest,
  updatePayrollRecord,
  updatePerformanceReview,
  updatePosition,
  updateRecruitmentCandidate,
  updateRecruitmentJob,
  updateWorkspaceWorkItemSchedule
} from "./hr.service.js";

export async function postHrEnsure(req, res, next) {
  try {
    const result = await ensureHrSchema();
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getEmployees(req, res, next) {
  try {
    res.json(await listEmployees(req.query || {}));
  } catch (error) {
    next(error);
  }
}

export async function getEmployeeById(req, res, next) {
  try {
    res.json(await getEmployee(req.params.employeeId));
  } catch (error) {
    next(error);
  }
}

export async function postEmployee(req, res, next) {
  try {
    res.status(201).json(await createEmployee(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function putEmployee(req, res, next) {
  try {
    res.json(await updateEmployee(req.params.employeeId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeEmployee(req, res, next) {
  try {
    res.json(await deleteEmployee(req.params.employeeId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getDepartments(req, res, next) {
  try {
    res.json(await listDepartments(req.query || {}));
  } catch (error) {
    next(error);
  }
}

export async function getDepartmentById(req, res, next) {
  try {
    res.json(await getDepartment(req.params.departmentId));
  } catch (error) {
    next(error);
  }
}

export async function postDepartment(req, res, next) {
  try {
    res.status(201).json(await createDepartment(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function putDepartment(req, res, next) {
  try {
    res.json(await updateDepartment(req.params.departmentId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeDepartment(req, res, next) {
  try {
    res.json(await deleteDepartment(req.params.departmentId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getPositions(req, res, next) {
  try {
    res.json(await listPositions(req.query || {}));
  } catch (error) {
    next(error);
  }
}

export async function getPositionById(req, res, next) {
  try {
    res.json(await getPosition(req.params.positionId));
  } catch (error) {
    next(error);
  }
}

export async function postPosition(req, res, next) {
  try {
    res.status(201).json(await createPosition(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function putPosition(req, res, next) {
  try {
    res.json(await updatePosition(req.params.positionId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removePosition(req, res, next) {
  try {
    res.json(await deletePosition(req.params.positionId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getAttendance(req, res, next) {
  try {
    res.json(await listAttendanceRecords(req.query || {}));
  } catch (error) {
    next(error);
  }
}

export async function getAttendanceById(req, res, next) {
  try {
    res.json(await getAttendanceRecord(req.params.attendanceId));
  } catch (error) {
    next(error);
  }
}

export async function postAttendance(req, res, next) {
  try {
    res.status(201).json(await createAttendanceRecord(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function putAttendance(req, res, next) {
  try {
    res.json(await updateAttendanceRecord(req.params.attendanceId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeAttendance(req, res, next) {
  try {
    res.json(await deleteAttendanceRecord(req.params.attendanceId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getLeaves(req, res, next) {
  try {
    res.json(await listLeaveRequests(req.query || {}));
  } catch (error) {
    next(error);
  }
}

export async function getLeaveById(req, res, next) {
  try {
    res.json(await getLeaveRequest(req.params.leaveId));
  } catch (error) {
    next(error);
  }
}

export async function postLeave(req, res, next) {
  try {
    res.status(201).json(await createLeaveRequest(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function putLeave(req, res, next) {
  try {
    res.json(await updateLeaveRequest(req.params.leaveId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeLeave(req, res, next) {
  try {
    res.json(await deleteLeaveRequest(req.params.leaveId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getRecruitmentJobs(req, res, next) {
  try {
    res.json(await listRecruitmentJobs(req.query || {}));
  } catch (error) {
    next(error);
  }
}

export async function getRecruitmentJobById(req, res, next) {
  try {
    res.json(await getRecruitmentJob(req.params.jobId));
  } catch (error) {
    next(error);
  }
}

export async function postRecruitmentJob(req, res, next) {
  try {
    res.status(201).json(await createRecruitmentJob(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function putRecruitmentJob(req, res, next) {
  try {
    res.json(await updateRecruitmentJob(req.params.jobId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeRecruitmentJob(req, res, next) {
  try {
    res.json(await deleteRecruitmentJob(req.params.jobId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getRecruitmentCandidates(req, res, next) {
  try {
    res.json(await listRecruitmentCandidates(req.query || {}));
  } catch (error) {
    next(error);
  }
}

export async function getRecruitmentCandidateById(req, res, next) {
  try {
    res.json(await getRecruitmentCandidate(req.params.candidateId));
  } catch (error) {
    next(error);
  }
}

export async function postRecruitmentCandidate(req, res, next) {
  try {
    res.status(201).json(await createRecruitmentCandidate(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function putRecruitmentCandidate(req, res, next) {
  try {
    res.json(await updateRecruitmentCandidate(req.params.candidateId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeRecruitmentCandidate(req, res, next) {
  try {
    res.json(await deleteRecruitmentCandidate(req.params.candidateId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getPerformance(req, res, next) {
  try {
    res.json(await listPerformanceReviews(req.query || {}));
  } catch (error) {
    next(error);
  }
}

export async function getPerformanceById(req, res, next) {
  try {
    res.json(await getPerformanceReview(req.params.reviewId));
  } catch (error) {
    next(error);
  }
}

export async function postPerformance(req, res, next) {
  try {
    res.status(201).json(await createPerformanceReview(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function putPerformance(req, res, next) {
  try {
    res.json(await updatePerformanceReview(req.params.reviewId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removePerformance(req, res, next) {
  try {
    res.json(await deletePerformanceReview(req.params.reviewId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getPayroll(req, res, next) {
  try {
    res.json(await listPayrollRecords(req.query || {}));
  } catch (error) {
    next(error);
  }
}

export async function getPayrollById(req, res, next) {
  try {
    res.json(await getPayrollRecord(req.params.payrollId));
  } catch (error) {
    next(error);
  }
}

export async function postPayroll(req, res, next) {
  try {
    res.status(201).json(await createPayrollRecord(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function putPayroll(req, res, next) {
  try {
    res.json(await updatePayrollRecord(req.params.payrollId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removePayroll(req, res, next) {
  try {
    res.json(await deletePayrollRecord(req.params.payrollId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getWorkspaceResources(req, res, next) {
  try {
    res.json(await getResourceSnapshot(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getWorkspaceWorkload(req, res, next) {
  try {
    res.json(await getWorkloadSnapshot(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postAssignmentAdvice(req, res, next) {
  try {
    res.json(await getAssignmentAdvice(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getAssignmentAdviceStatus(req, res, next) {
  try {
    res.set("Cache-Control", "no-store, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json(getAssignmentAdviceAvailability());
  } catch (error) {
    next(error);
  }
}

export async function patchWorkspaceWorkItemSchedule(req, res, next) {
  try {
    res.json(await updateWorkspaceWorkItemSchedule(req.params.workItemId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postAssignmentPreview(req, res, next) {
  try {
    res.status(201).json(await previewAssignment(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postAssignmentConfirm(req, res, next) {
  try {
    res.status(201).json(await confirmAssignment(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postAssignmentForceConfirm(req, res, next) {
  try {
    res.status(201).json(await confirmAssignment(req.body || {}, req.auth || {}, { forced: true }));
  } catch (error) {
    next(error);
  }
}
