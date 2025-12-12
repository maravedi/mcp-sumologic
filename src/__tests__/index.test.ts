
import { describe, expect, test, jest } from '@jest/globals';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock dependencies
const mockTool = jest.fn();
const mockConnect = jest.fn();
const mockClose = jest.fn();

jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: jest.fn().mockImplementation(() => ({
      tool: mockTool,
      connect: mockConnect,
      close: mockClose,
    })),
  };
});

jest.mock('@/domains/sumologic/client.js', () => ({
  search: jest.fn(),
}));

jest.mock('@/lib/sumologic/client.js', () => ({
  client: jest.fn(),
}));

describe('Sumologic MCP Server', () => {
  test('search_sumologic tool should have ISO 8601 description for from/to', async () => {
      await import('../index');

       const toolCalls = mockTool.mock.calls;
       const searchTool = toolCalls.find((call: any) => call[0] === 'search_sumologic');

       if (!searchTool) {
         throw new Error('search_sumologic tool not found');
       }

       const schema = searchTool[1] as any;

       const fromField = schema.from;
       expect(fromField).toBeDefined();

       expect(fromField.description).toBe('ISO 8601 format');

       const toField = schema.to;
       expect(toField).toBeDefined();
       expect(toField.description).toBe('ISO 8601 format');
  });
});
