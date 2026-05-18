import { Router } from "express";
import { authRequired, requirePermission } from "../../middlewares/auth.js";
import {
  getAttendance,
  getAttendanceById,
  getDepartmentById,
  getDepartments,
  getEmployeeById,
  getEmployees,
  getLeaveById,
  getLeaves,
  getPayroll,
  getPayrollById,
  getPerformance,
  getPerformanceById,
  getPositionById,
  getPositions,
  getRecruitmentCandidateById,
  getRecruitmentCandidates,
  getRecruitmentJobById,
  getRecruitmentJobs,
  getWorkspaceResources,
  getWorkspaceWorkload,
  getAssignmentAdviceStatus,
  patchWorkspaceWorkItemSchedule,
  postAssignmentAdvice,
  postAssignmentConfirm,
  postAssignmentForceConfirm,
  postAssignmentPreview,
  postAttendance,
  postDepartment,
  postEmployee,
  postHrEnsure,
  postLeave,
  postPayroll,
  postPerformance,
  postPosition,
  postRecruitmentCandidate,
  postRecruitmentJob,
  putAttendance,
  putDepartment,
  putEmployee,
  putLeave,
  putPayroll,
  putPerformance,
  putPosition,
  putRecruitmentCandidate,
  putRecruitmentJob,
  removeAttendance,
  removeDepartment,
  removeEmployee,
  removeLeave,
  removePayroll,
  removePerformance,
  removePosition,
  removeRecruitmentCandidate,
  removeRecruitmentJob
} from "./hr.controller.js";

const router = Router();
const requireHrManage = requirePermission("hr.manage");
const requireWorkspaceWrite = requirePermission("workspace.write");
const requireAssignmentAdvice = requirePermission(["workspace.write", "hr.read", "hr.manage"]);
const requireResourceForceAssign = requirePermission("resource.forceassign");

router.post("/hr/ensure", authRequired, requireHrManage, postHrEnsure);

router.get("/workspace/resources", authRequired, getWorkspaceResources);
router.get("/workspace/workload", authRequired, getWorkspaceWorkload);
router.get("/workspace/resources/ai/assignment-advice", authRequired, requireAssignmentAdvice, getAssignmentAdviceStatus);
router.post("/workspace/resources/ai/assignment-advice", authRequired, requireAssignmentAdvice, postAssignmentAdvice);
router.patch("/workspace/resources/work-items/:workItemId/schedule", authRequired, requireWorkspaceWrite, patchWorkspaceWorkItemSchedule);
router.post("/workspace/assignments/preview", authRequired, requireWorkspaceWrite, postAssignmentPreview);
router.post("/workspace/assignments/confirm", authRequired, requireWorkspaceWrite, postAssignmentConfirm);
router.post("/workspace/assignments/force-confirm", authRequired, requireResourceForceAssign, postAssignmentForceConfirm);

router.get("/hr/employees", authRequired, requireHrManage, getEmployees);
router.post("/hr/employees", authRequired, requireHrManage, postEmployee);
router.get("/hr/employees/:employeeId", authRequired, requireHrManage, getEmployeeById);
router.put("/hr/employees/:employeeId", authRequired, requireHrManage, putEmployee);
router.delete("/hr/employees/:employeeId", authRequired, requireHrManage, removeEmployee);

router.get("/hr/departments", authRequired, requireHrManage, getDepartments);
router.post("/hr/departments", authRequired, requireHrManage, postDepartment);
router.get("/hr/departments/:departmentId", authRequired, requireHrManage, getDepartmentById);
router.put("/hr/departments/:departmentId", authRequired, requireHrManage, putDepartment);
router.delete("/hr/departments/:departmentId", authRequired, requireHrManage, removeDepartment);

router.get("/hr/positions", authRequired, requireHrManage, getPositions);
router.post("/hr/positions", authRequired, requireHrManage, postPosition);
router.get("/hr/positions/:positionId", authRequired, requireHrManage, getPositionById);
router.put("/hr/positions/:positionId", authRequired, requireHrManage, putPosition);
router.delete("/hr/positions/:positionId", authRequired, requireHrManage, removePosition);

router.get("/hr/attendance", authRequired, requireHrManage, getAttendance);
router.post("/hr/attendance", authRequired, requireHrManage, postAttendance);
router.get("/hr/attendance/:attendanceId", authRequired, requireHrManage, getAttendanceById);
router.put("/hr/attendance/:attendanceId", authRequired, requireHrManage, putAttendance);
router.delete("/hr/attendance/:attendanceId", authRequired, requireHrManage, removeAttendance);

router.get("/hr/leaves", authRequired, requireHrManage, getLeaves);
router.post("/hr/leaves", authRequired, requireHrManage, postLeave);
router.get("/hr/leaves/:leaveId", authRequired, requireHrManage, getLeaveById);
router.put("/hr/leaves/:leaveId", authRequired, requireHrManage, putLeave);
router.delete("/hr/leaves/:leaveId", authRequired, requireHrManage, removeLeave);

router.get("/hr/recruitment/jobs", authRequired, requireHrManage, getRecruitmentJobs);
router.post("/hr/recruitment/jobs", authRequired, requireHrManage, postRecruitmentJob);
router.get("/hr/recruitment/jobs/:jobId", authRequired, requireHrManage, getRecruitmentJobById);
router.put("/hr/recruitment/jobs/:jobId", authRequired, requireHrManage, putRecruitmentJob);
router.delete("/hr/recruitment/jobs/:jobId", authRequired, requireHrManage, removeRecruitmentJob);

router.get("/hr/recruitment/candidates", authRequired, requireHrManage, getRecruitmentCandidates);
router.post("/hr/recruitment/candidates", authRequired, requireHrManage, postRecruitmentCandidate);
router.get("/hr/recruitment/candidates/:candidateId", authRequired, requireHrManage, getRecruitmentCandidateById);
router.put("/hr/recruitment/candidates/:candidateId", authRequired, requireHrManage, putRecruitmentCandidate);
router.delete("/hr/recruitment/candidates/:candidateId", authRequired, requireHrManage, removeRecruitmentCandidate);

router.get("/hr/performance", authRequired, requireHrManage, getPerformance);
router.post("/hr/performance", authRequired, requireHrManage, postPerformance);
router.get("/hr/performance/:reviewId", authRequired, requireHrManage, getPerformanceById);
router.put("/hr/performance/:reviewId", authRequired, requireHrManage, putPerformance);
router.delete("/hr/performance/:reviewId", authRequired, requireHrManage, removePerformance);

router.get("/hr/payroll", authRequired, requireHrManage, getPayroll);
router.post("/hr/payroll", authRequired, requireHrManage, postPayroll);
router.get("/hr/payroll/:payrollId", authRequired, requireHrManage, getPayrollById);
router.put("/hr/payroll/:payrollId", authRequired, requireHrManage, putPayroll);
router.delete("/hr/payroll/:payrollId", authRequired, requireHrManage, removePayroll);

export default router;
