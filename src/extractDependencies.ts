// src/extractDependencies.ts

import axios from 'axios';
import * as fs from 'fs/promises';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// --- Configuration & Constants ---
const ACCOUNT_ID = process.env.BOOMI_ACCOUNT_ID as string;
const USERNAME = process.env.BOOMI_USERNAME as string;
const TOKEN = process.env.BOOMI_TOKEN as string;
const ROOT_COMPONENT_ID = process.env.ROOT_COMPONENT_ID as string;
const OUTPUT_FILE = '../public/data/graph.json';

// --- Retry Logic Configuration ---
const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1000; // 1 second

if (!ACCOUNT_ID || !USERNAME || !TOKEN || !ROOT_COMPONENT_ID) {
    throw new Error("Missing one or more required environment variables (BOOMI_ACCOUNT_ID, BOOMI_USERNAME, BOOMI_TOKEN, ROOT_COMPONENT_ID).");
}

// --- Types for Graph & API ---

// ComponentInfo structure simplified for our needs
type ComponentInfo = {
    id: string;
    name: string;
    type: string;
    version?: number;
};

// Graph structure for Cytoscape/D3
type Node = {
    id: string;
    name: string;
    type: string;
};

type Edge = {
    source: string;
    target: string;
};

// The final output structure
type GraphData = {
    nodes: Node[];
    edges: Edge[];
};

// --- Custom Error for API Failures ---
class ApiError extends Error {
    public status?: number;
    public attempts?: number;

    constructor(message: string, status?: number, attempts?: number) {
        super(message);
        this.name = 'ApiError';
        
        this.status = status;
        this.attempts = attempts;
    }
}

// --- API Client Setup ---
const apiClient = axios.create({
    baseURL: `https://api.boomi.com/api/rest/v1/${ACCOUNT_ID}`,
    auth: { username: USERNAME, password: TOKEN },
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
});

// Helper function to pause execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Generic method to handle retries with exponential backoff and jitter
async function requestWithRetry<T>(requestFn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await requestFn();
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const status = error.response.status;
                // Check for retryable server errors
                if (status === 503 || status === 504) {
                    if (attempt === MAX_RETRIES) {
                        throw new ApiError(`API request failed after ${MAX_RETRIES} attempts with status ${status}.`, status, attempt);
                    }
                    // Calculate exponential backoff with jitter
                    const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 1000;
                    console.warn(`[API] Received status ${status}. Retrying in ${Math.round(delayMs / 1000)}s... (Attempt ${attempt}/${MAX_RETRIES})`);
                    await delay(delayMs);
                    continue;
                }
            }
            throw error;
        }
    }
    // This part should be unreachable but is included for type safety
    throw new ApiError('Retry loop completed without success or failure.', undefined, MAX_RETRIES);
}


// Fetches component metadata (name, type, version)
async function getComponentMetadata(componentId: string): Promise<ComponentInfo | null> {
    try {
        const response = await requestWithRetry(() => 
            apiClient.get<{ name: string, type: string, version: number }>(`/ComponentMetadata/${componentId}`)
        );
        return {
            id: componentId,
            name: response.data.name,
            type: response.data.type,
            version: response.data.version
        };
    } catch (error) {
        // Log and handle the component not found case as in your original script
        if (axios.isAxiosError(error) && (error.response?.status === 400 || error.response?.status === 404)) {
            console.warn(`[API] Component ${componentId} not found.`);
            return null;
        }
        throw error;
    }
}

// Fetches a component's direct dependencies
async function getDependencies(componentId: string, version: number): Promise<string[]> {
    const queryBody = {
        QueryFilter: {
            expression: {
                operator: 'and',
                nestedExpression: [
                    { operator: 'EQUALS', property: 'parentComponentId', argument: [componentId] },
                    { operator: 'EQUALS', property: 'parentVersion', argument: [version] },
                ],
            },
        },
    };

    try {
        const response = await requestWithRetry(() => 
            apiClient.post<{ result?: { references?: { componentId: string }[] }[] }>('/ComponentReference/query', queryBody)
        );
        
        // Flatten the complex Boomi response into a simple array of IDs
        return response.data.result?.flatMap(r => r.references?.map(ref => ref.componentId) || []) || [];

    } catch (error) {
        console.error(`[API] Failed to fetch dependencies for ${componentId}.`, error);
        return []; // Fail gracefully and stop traversal down this path
    }
}

// The recursive traversal logic
async function findAllDependenciesRecursive(rootId: string): Promise<{ nodes: Map<string, Node>, edges: Edge[] }> {
    const nodesMap = new Map<string, Node>();
    const edges: Edge[] = [];

    const _recursiveHelper = async (componentId: string): Promise<void> => {
        if (nodesMap.has(componentId)) return; // Stop if already processed

        const metadata = await getComponentMetadata(componentId);
        if (!metadata) return; // Stop if not found

        // 1. Add the component as a node
        nodesMap.set(componentId, { id: metadata.id, name: metadata.name, type: metadata.type });
        
        // 2. Get dependencies
        const dependencyIds = await getDependencies(componentId, metadata.version as number);

        // 3. Create edges and recurse
        const discoveryPromises = dependencyIds.map(depId => {
            // Edge from parent (componentId) to child (depId)
            edges.push({ source: componentId, target: depId });
            
            // Recurse for the child component
            return _recursiveHelper(depId);
        });

        await Promise.all(discoveryPromises);
    };

    await _recursiveHelper(rootId);
    
    return { nodes: nodesMap, edges };
}

// --- Main Execution Block ---
console.log(`Starting dependency extraction from Boomi Component ID: ${ROOT_COMPONENT_ID}`);
console.log("--------------------------------------------------------------------");

try {
    const { nodes: nodesMap, edges } = await findAllDependenciesRecursive(ROOT_COMPONENT_ID);
    const nodesArray = Array.from(nodesMap.values());
    const graphData: GraphData = { nodes: nodesArray, edges: edges };

    await fs.writeFile(OUTPUT_FILE, JSON.stringify(graphData, null, 2));

    console.log("--------------------------------------------------------------------");
    console.log(`✅ Extraction Complete! Found ${nodesArray.length} components and ${edges.length} dependencies.`);
    console.log(`Data written to ${OUTPUT_FILE}`);

} catch (error) {
    console.error("❌ Fatal Error during extraction:", error);
    process.exit(1); // Exit with an error code on failure
}