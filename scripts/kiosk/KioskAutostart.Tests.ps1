<#
    Pester tests for the pure kiosk auto-start logic (KioskPolicy.ps1).

    Runner: Pester 3.4 (the version that ships with Windows PowerShell 5.1), so
    the assertion syntax is `Should Be`, not the `Should -Be` of Pester 4+.

    These cover the drift-prone decision logic and the deployment naming. The
    watchdog LOOP and the scheduler CALLS are IO and are verified by running the
    scripts with -DryRun / a stub exe (see docs/ai_handoff.md); they are not
    mocked here.

    Run: npm run test:watchdog
    (kept OUT of `npm test`, which stays the 308-test vitest suite.)
#>

. (Join-Path $PSScriptRoot 'KioskPolicy.ps1')

# A small, fast policy so tests never wait real seconds and the thresholds are
# obvious. Same shape as Get-KioskWatchdogPolicy.
$testPolicy = [pscustomobject]@{
    CleanExitCode        = 0
    MinHealthyRunSeconds = 10
    MaxRapidCrashes      = 3
    ShortBackoffSeconds  = 1
    CoolOffSeconds       = 99
}

Describe 'Get-RestartDecision' {

    It 'stops on a clean exit (staff double-Esc)' {
        $d = Get-RestartDecision -ExitCode 0 -RunSeconds 3 -ConsecutiveFastCrashes 2 -Policy $testPolicy
        $d.Action | Should Be 'Stop'
        $d.Reason | Should Be 'clean-exit'
        $d.DelaySeconds | Should Be 0
        $d.NextConsecutiveFastCrashes | Should Be 0
    }

    It 'relaunches and resets the counter after a healthy run then crash' {
        $d = Get-RestartDecision -ExitCode 1 -RunSeconds 120 -ConsecutiveFastCrashes 2 -Policy $testPolicy
        $d.Action | Should Be 'Relaunch'
        $d.Reason | Should Be 'healthy-run-crash'
        $d.DelaySeconds | Should Be 1
        $d.NextConsecutiveFastCrashes | Should Be 0
    }

    It 'treats a run exactly at the healthy threshold as healthy' {
        $d = Get-RestartDecision -ExitCode 1 -RunSeconds 10 -ConsecutiveFastCrashes 0 -Policy $testPolicy
        $d.Reason | Should Be 'healthy-run-crash'
    }

    It 'relaunches and increments on a fast crash below the limit' {
        $d = Get-RestartDecision -ExitCode 1 -RunSeconds 2 -ConsecutiveFastCrashes 1 -Policy $testPolicy
        $d.Action | Should Be 'Relaunch'
        $d.Reason | Should Be 'fast-crash'
        $d.NextConsecutiveFastCrashes | Should Be 2
    }

    It 'cools off when fast crashes reach the limit' {
        # limit is 3; counter was 2, this crash makes it 3.
        $d = Get-RestartDecision -ExitCode 1 -RunSeconds 2 -ConsecutiveFastCrashes 2 -Policy $testPolicy
        $d.Action | Should Be 'CoolOff'
        $d.Reason | Should Be 'crash-loop'
        $d.DelaySeconds | Should Be 99
        $d.NextConsecutiveFastCrashes | Should Be 0
    }

    It 'treats a negative exit code as a crash, not a clean exit' {
        $d = Get-RestartDecision -ExitCode -1073741819 -RunSeconds 2 -ConsecutiveFastCrashes 0 -Policy $testPolicy
        $d.Action | Should Be 'Relaunch'
        $d.Reason | Should Be 'fast-crash'
    }

    It 'defaults ConsecutiveFastCrashes to 0' {
        $d = Get-RestartDecision -ExitCode 1 -RunSeconds 2 -Policy $testPolicy
        $d.NextConsecutiveFastCrashes | Should Be 1
    }

    It 'uses the shipped policy when none is passed (clean exit still stops)' {
        $d = Get-RestartDecision -ExitCode 0 -RunSeconds 1
        $d.Action | Should Be 'Stop'
    }
}

Describe 'Get-KioskWatchdogPolicy' {
    It 'clean exit code is 0 (matches the Tauri clean-close code)' {
        (Get-KioskWatchdogPolicy).CleanExitCode | Should Be 0
    }
    It 'has a positive crash-loop limit and cool-off' {
        $p = Get-KioskWatchdogPolicy
        ($p.MaxRapidCrashes -gt 0) | Should Be $true
        ($p.CoolOffSeconds -gt $p.ShortBackoffSeconds) | Should Be $true
    }
}

Describe 'Deployment naming (must match the tauri configs)' {
    It 'portrait product name' {
        Get-KioskProductName -Orientation portrait | Should Be 'MAP Jigsaw Puzzle'
    }
    It 'landscape product name' {
        Get-KioskProductName -Orientation landscape | Should Be 'MAP Jigsaw Puzzle Landscape'
    }
    It 'task name derives from the product' {
        Get-KioskTaskName -Orientation portrait | Should Be 'MAP Jigsaw Puzzle Kiosk'
        Get-KioskTaskName -Orientation landscape | Should Be 'MAP Jigsaw Puzzle Landscape Kiosk'
    }
}

Describe 'Get-KioskInstallDirCandidates' {
    It 'includes <ProgramFiles>\<Product> for portrait' {
        $dirs = Get-KioskInstallDirCandidates -Orientation portrait -ProgramFiles 'C:\PF' -ProgramFilesX86 'C:\PFx86'
        ($dirs -contains 'C:\PF\MAP Jigsaw Puzzle') | Should Be $true
        ($dirs -contains 'C:\PFx86\MAP Jigsaw Puzzle') | Should Be $true
    }
    It 'includes the landscape product dir for landscape' {
        $dirs = Get-KioskInstallDirCandidates -Orientation landscape -ProgramFiles 'C:\PF' -ProgramFilesX86 ''
        ($dirs -contains 'C:\PF\MAP Jigsaw Puzzle Landscape') | Should Be $true
    }
    It 'skips an empty Program Files root' {
        $dirs = @(Get-KioskInstallDirCandidates -Orientation portrait -ProgramFiles 'C:\PF' -ProgramFilesX86 '')
        $dirs.Count | Should Be 1
    }
}
