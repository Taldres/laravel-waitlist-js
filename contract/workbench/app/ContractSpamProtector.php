<?php

declare(strict_types=1);

namespace Workbench\App;

use Illuminate\Http\Request;
use Taldres\Waitlist\Auth\WaitlistCaller;
use Taldres\Waitlist\Support\TimeTrapSpamProtector;

/**
 * The package's time trap, plus a header value that stands in for a solved
 * challenge, so a test does not wait for the two seconds. The package lets a
 * server pass unchecked; here it is checked too, so the tests can see a refusal.
 */
final class ContractSpamProtector extends TimeTrapSpamProtector
{
    public function passes(Request $request): bool
    {
        if ($request->header(self::HEADER) === 'passed') {
            return true;
        }

        return ! WaitlistCaller::isServer($request) && parent::passes($request);
    }
}
