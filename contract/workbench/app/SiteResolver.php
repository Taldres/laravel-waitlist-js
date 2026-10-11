<?php

declare(strict_types=1);

namespace Workbench\App;

use Illuminate\Http\Request;
use Taldres\Waitlist\Contracts\ProjectResolver;

/**
 * Stands in for a resolver by site: a guest names its project in a header, and
 * every other request acts for the default one.
 */
final class SiteResolver implements ProjectResolver
{
    public function resolve(Request $request): string
    {
        return (string) ($request->header('X-Contract-Project') ?: 'default');
    }
}
