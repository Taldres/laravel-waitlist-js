<?php

declare(strict_types=1);

namespace Workbench\App;

use Illuminate\Auth\GenericUser;
use Taldres\Waitlist\Contracts\HasWaitlistProject;

/**
 * A project's server holding that project's token, as the client is used.
 */
final class ProjectServer extends GenericUser implements HasWaitlistProject
{
    public function __construct(private readonly string $project)
    {
        parent::__construct(['id' => "server:{$project}"]);
    }

    public function waitlistProject(): string
    {
        return $this->project;
    }
}
