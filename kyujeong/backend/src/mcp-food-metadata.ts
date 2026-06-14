import 'dotenv/config';
import { FoodMetadataMcpServer } from './food-metadata/mcp/food-metadata-mcp.server';

new FoodMetadataMcpServer().start();
