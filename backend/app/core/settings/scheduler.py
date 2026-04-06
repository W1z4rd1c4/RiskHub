class SchedulerSettingsMixin:
    # AD deprovision scheduler
    ad_deprovision_check_interval_minutes: int = 24 * 60
    ad_deprovision_check_hour: int = 2
    ad_deprovision_check_minute: int = 0
