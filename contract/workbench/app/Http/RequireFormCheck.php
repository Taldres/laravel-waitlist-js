<?php

declare(strict_types=1);

namespace Workbench\App\Http;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stands in for a check on the forms, such as CSRF: the signup group asks for
 * it, the token links that mail providers call must not.
 */
final class RequireFormCheck
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->header('X-Form-Check') === 'passed', 419);

        return $next($request);
    }
}
