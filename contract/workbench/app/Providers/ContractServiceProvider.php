<?php

declare(strict_types=1);

namespace Workbench\App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Taldres\Waitlist\Definitions\ProjectDefinition;
use Taldres\Waitlist\Enums\WaitlistLimiter;
use Taldres\Waitlist\Actions\PruneEntries;
use Taldres\Waitlist\Events\EntrySubscribed;
use Taldres\Waitlist\Events\ManageLinkRequested;
use Taldres\Waitlist\Events\ReconfirmationRequested;
use Taldres\Waitlist\Facades\Waitlist;
use Taldres\Waitlist\Models\WaitlistEntry;
use Taldres\Waitlist\Contracts\ProjectResolver;
use Taldres\Waitlist\Contracts\SpamProtector;
use Workbench\App\ContractSpamProtector;
use Workbench\App\Http\RequireFormCheck;
use Workbench\App\Http\TravelInTime;
use Workbench\App\ProjectServer;
use Workbench\App\SiteResolver;

class ContractServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        config()->set('waitlist.routes.middleware', [TravelInTime::class]);
        config()->set('waitlist.routes.group_middleware.signup', [RequireFormCheck::class]);
        config()->set('waitlist.authentication.guards', ['project']);
        config()->set('auth.guards.project', ['driver' => 'project-token']);

        $this->app->bind(ProjectResolver::class, SiteResolver::class);

        $this->app->bind(SpamProtector::class, ContractSpamProtector::class);
    }

    public function boot(): void
    {
        // Many apps turn it off, and the API must look the same in them.
        JsonResource::withoutWrapping();

        // The second token belongs to another project's server, which the gate keeps from this one's lists.
        Auth::viaRequest('project-token', fn (Request $request): ?ProjectServer => match ($request->bearerToken()) {
            'contract-token' => new ProjectServer('default'),
            'foreign-token' => new ProjectServer('other'),
            default => null,
        });

        // Replaces the package's limiter for the token links: only tokens meant
        // to hit the limit have one, so no other test does.
        RateLimiter::for(WaitlistLimiter::Links->value, fn (Request $request): Limit => str_starts_with((string) $request->route('token'), 'rate-limited')
            ? Limit::perMinute(2)->by((string) $request->route('token'))
            : Limit::none());

        Waitlist::define(function (ProjectDefinition $project): void {
            // Only a request that names another origin is refused, and the tests send none otherwise.
            $project->origins(['https://site.example']);
            $project->wordingFromCallers();
            $project->retention(reconfirmAfterDays: 30);
            $project->list('beta', purpose: 'waitlist')->optional('newsletter')->publicPosition();
            $project->list('queue', purpose: 'waitlist')->publicCount();
            // No test signs up here, which keeps the count below the 10 it shows.
            $project->list('quiet', purpose: 'waitlist')->publicCount();
            $project->list('teams', purpose: 'waitlist')->fields(fn (): array => [
                'company' => ['required', 'string', 'max:120'],
            ]);
        });

        // A project without a preference page, for the guests that name it.
        Waitlist::define('plain', function (ProjectDefinition $project): void {
            $project->purpose('waitlist', ['2026-10' => 'Email me when early access opens.']);
            $project->list('beta', purpose: 'waitlist');
            $project->manageLinks(false);
        });

        // The package sends no mail, so the tests read the tokens a mail would carry here.
        Event::listen(EntrySubscribed::class, fn (EntrySubscribed $event) => $this->remember($event->entry, [
            'confirm' => $event->confirmToken,
            'unsubscribe' => $event->unsubscribeToken,
        ]));
        Event::listen(ReconfirmationRequested::class, fn (ReconfirmationRequested $event) => $this->remember($event->entry, [
            'confirm' => $event->confirmToken,
        ]));
        Event::listen(ManageLinkRequested::class, fn (ManageLinkRequested $event) => $this->remember($event->entry, [
            'manage' => $event->manageToken,
        ]));

        // Asks the confirmed addresses again, as waitlist:prune does in the scheduler, at the time of X-Contract-Now.
        Route::post('contract/prune', fn (PruneEntries $prune): array => ['asked' => $prune()->asked])->middleware(TravelInTime::class);

        Route::get('contract/tokens/{email}', fn (string $email): array => Cache::get("contract-tokens:{$email}", []));
    }

    /**
     * @param  array<string, string|null>  $tokens
     */
    private function remember(WaitlistEntry $entry, array $tokens): void
    {
        $key = "contract-tokens:{$entry->email}";

        Cache::forever($key, [...Cache::get($key, []), ...$tokens]);
    }
}
