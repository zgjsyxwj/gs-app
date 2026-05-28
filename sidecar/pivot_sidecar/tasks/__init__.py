from .base    import TaskBase
from .mp_cn   import MpCnTask
from .ww_au   import WwAuTask
from .mp_in   import MpInTask
from .va_tw_payroll_split import VaTwPayrollSplitTask
from .va_vn_r import VaVnReportTask
from .va_vn_ps import VaVnPayslipTask

REGISTRY: dict[str, TaskBase] = {
    t.task_id: t for t in [
        MpCnTask(),
        WwAuTask(),
        MpInTask(),
        VaTwPayrollSplitTask(),
        VaVnReportTask(),
        VaVnPayslipTask(),
    ]
}
