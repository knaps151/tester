<?php

namespace App\Storage;

use App\Http\Requests\CreateTokenRequest;
use Carbon\Carbon;
use Ramsey\Uuid\Uuid;

class Token extends Entity
{
    /**
     * @param $tokenId
     * @return string
     */
    public static function getIdentifier($tokenId = null)
    {
        return sprintf('token:%s', $tokenId);
    }

    /**
     * Get the expiry time for this token, falling back to default config if not set.
     *
     * @return int
     */
    public function getExpiry()
    {
        return isset($this->expiry) && $this->expiry !== null
            ? (int)$this->expiry
            : config('app.expiry');
    }

    /**
     * Get the max requests limit for this token, falling back to default config if not set.
     *
     * @return int
     */
    public function getMaxRequests()
    {
        return isset($this->max_requests) && $this->max_requests !== null
            ? (int)$this->max_requests
            : config('app.max_requests');
    }

    /**
     * @param CreateTokenRequest $request
     * @return Token
     */
    public static function createFromRequest(CreateTokenRequest $request)
    {
        return new self([
            'uuid' => Uuid::uuid4()->toString(),
            'ip' => $request->ip(),
            'user_agent' => $request->header('User-Agent'),
            'default_content' => $request->get('default_content', ''),
            'default_status' => (int)$request->get('default_status', 200),
            'default_content_type' => $request->get('default_content_type', 'text/plain'),
            'timeout' => (int)$request->get('timeout', null),
            'expiry' => $request->get('expiry') !== null ? (int)$request->get('expiry') : null,
            'max_requests' => $request->get('max_requests') !== null ? (int)$request->get('max_requests') : null,
            'cors' => false,
            'created_at' => Carbon::now()->toDateTimeString(),
            'updated_at' => Carbon::now()->toDateTimeString(),
        ]);
    }
}