# bedrock-service-core

## Zcap Expiration Logging

Proactive logging for zcap expiration events, designed for observability alerting.

### Configuration

```js
// bedrock config
config['service-core'].zcapExpiration = {
  // Key for metric filters: { $.logName = "zcap-expiration" }
  logName: 'zcap-expiration',

  // Warn when zcaps expire within threshold (default: 7 days)
  // Set to `false` to disable
  logNearExpiration: {
    threshold: 7 * 24 * 60 * 60 * 1000
  },

  // Log when expired zcaps are presented (default: true)
  // Set to `false` to disable
  logExpired: true
};
```

### Log Events

**Near-expiration** (warning level):
```json
{
  "logName": "zcap-expiration",
  "event": "zcap-near-expiration",
  "capabilityId": "urn:zcap:...",
  "invocationTarget": "https://...",
  "timeUntilExpirationMs": 432000000
}
```

**Expired** (error level):
```json
{
  "logName": "zcap-expiration",
  "event": "zcap-expired",
  "capabilityId": "urn:zcap:...",
  "invocationTarget": "https://...",
  "expiredAgoMs": 3600000
}
```
