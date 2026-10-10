<?php

declare(strict_types=1);

namespace Workbench\App\Http;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Lets a test expire a link without waiting: the request is handled as if
 * made at the time in X-Contract-Now.
 */
final class TravelInTime
{
    public function handle(Request $request, Closure $next): mixed
    {
        $now = $request->header('X-Contract-Now');

        if (is_string($now)) {
            Carbon::setTestNow(Carbon::parse($now));
        }

        return $next($request);
    }
}
