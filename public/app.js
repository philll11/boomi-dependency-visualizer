// public/app.js

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch the graph data from the JSON file
        const response = await fetch('/data/graph.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch graph data. Status: ${response.status}`);
        }
        const graphData = await response.json();

        // Initialize Cytoscape.js
        const cy = cytoscape({
            container: document.getElementById('cy'), // The HTML element to render in

            // Provide the elements (nodes and edges) from our data file
            elements: {
                nodes: graphData.nodes.map(node => ({ data: node })),
                edges: graphData.edges.map(edge => ({ data: edge }))
            },

            // Define the visual style of the graph
            style: [
                // Default style for all nodes
                {
                    selector: 'node',
                    style: {
                        'label': 'data(name)',
                        'font-size': '10px',
                        'color': '#fff',
                        'text-outline-color': '#333',
                        'text-outline-width': 2,
                        'width': '60px',  // Give nodes a bit more size
                        'height': '60px',
                    }
                },
                // Style for specific Boomi component types
                {
                    selector: 'node[type="Process"]',
                    style: {
                        'background-color': '#007bff', // Blue
                        'shape': 'round-rectangle'
                    }
                },
                {
                    selector: 'node[type="Connector"]',
                    style: {
                        'background-color': '#28a745', // Green
                        'shape': 'diamond'
                    }
                },
                {
                    selector: 'node[type="Map"]',
                    style: {
                        'background-color': '#dc3545', // Red
                        'shape': 'hexagon'
                    }
                },
                {
                    selector: 'node[type="Profile"]',
                    style: {
                        'background-color': '#ffc107', // Yellow
                        'color': '#333', // Dark text for light background
                        'text-outline-color': '#eee',
                    }
                },
                {
                    selector: 'node[type="Message"]',
                    style: {
                        'background-color': '#17a2b8', // Cyan
                    }
                },
                // Default style for edges
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#ccc',
                        'target-arrow-color': '#ccc',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier'
                    }
                }
            ],

            // Specify the layout algorithm (a force-directed layout)
            layout: {
                name: 'cose', // Compound Spring Embedder layout
                idealEdgeLength: 100,
                nodeRepulsion: 400000,
                edgeElasticity: 100,
                gravity: 80,
                nestingFactor: 5,
                padding: 30,
                animate: true
            }
        });

        cy.on('tap', 'node', function (evt) {
            const node = evt.target;

            // Remove any previous highlights
            cy.elements().removeClass('highlighted');

            // Highlight the tapped node and its direct neighbors
            node.addClass('highlighted');
            node.neighborhood().addClass('highlighted');
        });

        // When the background is tapped, clear all highlights
        cy.on('tap', function (evt) {
            if (evt.target === cy) {
                cy.elements().removeClass('highlighted');
            }
        });

    } catch (error) {
        console.error("Error initializing visualization:", error);
        // Display an error message to the user on the page
        const container = document.getElementById('cy');
        if (container) {
            container.innerHTML = `<div style="padding: 20px; text-align: center; color: red;"><h2>Error Loading Visualization</h2><p>${error.message}</p><p>Please ensure you have run the data extraction script and the 'public/data/graph.json' file exists.</p></div>`;
        }
    }
});