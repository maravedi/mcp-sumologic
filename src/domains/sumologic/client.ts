import moment from 'moment';
import * as Sumo from '@/lib/sumologic/client.js';
import { maskSensitiveInfo } from '@/utils/pii.js';

export interface SearchResult {
  messages: any[];
  records?: any[];
}

interface SumoAPIError {
  statusCode?: number;
  message: string;
  error?: any;
  response?: {
    body: any;
  };
}

export async function search(
  client: Sumo.Client,
  query: string,
  timeRange?: { from?: string; to?: string },
): Promise<SearchResult> {
  const now = moment();
  const defaultTimeRange = {
    from: now.subtract(1, 'day').format(),
    to: now.format(),
  };

  const { from, to } = { ...defaultTimeRange, ...timeRange };

  // Create search job
  const jobParams = {
    query,
    from,
    to,
    timeZone: 'Asia/Hong_Kong',
  };

  try {
    const { id } = await client.job(jobParams);

    // Wait for job completion
    let status;
    do {
      try {
        status = await client.status(id);
        if (status.state !== 'DONE GATHERING RESULTS') {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
        }
      } catch (statusError) {
        throw statusError;
      }
    } while (status.state !== 'DONE GATHERING RESULTS');

    // Get results
    const promises: PromiseLike<any>[] = [client.messages(id)];
    let getRecords = false;

    if (status.recordCount > 0) {
      getRecords = true;
      promises.push(client.records(id));
    }

    const results = await Promise.all(promises);
    const messages = results[0];
    const records = getRecords ? results[1] : undefined;

    // Cleanup
    await client.delete(id);

    // Helper function to sanitize items (messages or records)
    const sanitizeItems = (items: any[]) => {
      return items.map((item: any) => {
        // Convert item.map to a plain object if it exists
        if (item.map && typeof item.map === 'object') {
          const plainMap: Record<string, string> = {};
          Object.keys(item.map).forEach((key) => {
            // Ensure values are strings and handle potential undefined values
            const rawValue = item.map[key]?.toString() || '';

            // Only apply PII masking to _raw and response fields
            if (key === '_raw' || key === 'response') {
              plainMap[key] = maskSensitiveInfo(rawValue);
            } else {
              plainMap[key] = rawValue;
            }
          });

          // Also mask the _raw property if it exists at the top level
          const maskedRaw = item._raw
            ? maskSensitiveInfo(item._raw.toString())
            : undefined;

          return {
            ...item,
            map: plainMap,
            _raw: maskedRaw,
          };
        }

        // If item has a _raw property (contains raw log text)
        if (item._raw && typeof item._raw === 'string') {
          return {
            ...item,
            _raw: maskSensitiveInfo(item._raw),
          };
        }

        // If item has a response property
        if (item.response && typeof item.response === 'string') {
          return {
            ...item,
            response: maskSensitiveInfo(item.response),
          };
        }

        // If item is a string, don't apply PII masking
        if (typeof item === 'string') {
          return item;
        }

        // If item is an object, only filter _raw and response fields
        if (typeof item === 'object' && item !== null) {
          const result = { ...item };

          if (result._raw && typeof result._raw === 'string') {
            result._raw = maskSensitiveInfo(result._raw);
          }

          if (result.response && typeof result.response === 'string') {
            result.response = maskSensitiveInfo(result.response);
          }

          return result;
        }

        // For other item formats, return as is
        return item;
      });
    };

    const sanitizedMessages = sanitizeItems(messages.messages);

    let sanitizedRecords;
    if (records) {
      sanitizedRecords = sanitizeItems(records.records);
    }

    const result: SearchResult = {
      messages: sanitizedMessages,
    };

    if (sanitizedRecords) {
      result.records = sanitizedRecords;
    }

    return result;
  } catch (error) {
    return {
      messages: [],
    };
  }
}
